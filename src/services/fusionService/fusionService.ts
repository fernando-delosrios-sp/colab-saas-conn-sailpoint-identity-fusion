import { Account, IdentityDocument } from 'sailpoint-api-client'
import { StdAccountListOutput, StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { FormService } from '../formService'
import { IdentityService } from '../identityService'
import { SourceInfo, SourceService, buildSourceConfigPatch } from '../sourceService'
import { FusionAccount } from '../../model/account'
import { attrConcat, AttributeService } from '../attributeService'
import { FUSION_MISSING_ID_KEY_PREFIX } from '../attributeService/constants'
import { assert } from '../../utils/assert'
import { createUrlContext, UrlContext } from '../../utils/url'
import { mapValuesToArray, forEachBatched, promiseAllBatched, compact } from './collections'
import { FusionDecision } from '../../model/form'
import { FusionMatch } from '../scoringService'
import { ScoringService } from '../scoringService'
import { SchemaService } from '../schemaService'
import { FusionReport, FusionReportAccount, FusionReportStats } from './types'
import {
    buildIdentityConflictWarningsFromMap,
    buildMinimalFusionReportAccount,
    getFusionIdentityConflictTrackingKey,
} from './fusionReportHelpers'
import { AttributeOperations } from '../attributeService/types'
import { MAX_CANDIDATES_FOR_FORM } from '../formService/constants'

// ============================================================================
// FusionService Class
// ============================================================================

/**
 * Service for identity fusion logic.
 * Pure in-memory operations - no ClientService dependency.
 * All data structures are passed in as parameters.
 */
export class FusionService {
    private fusionIdentityMap: Map<string, FusionAccount> = new Map()
    private fusionAccountMap: Map<string, FusionAccount> = new Map()
    // Managed accounts that were flagged as potential matches (forms created)
    private potentialMatchAccounts: FusionAccount[] = []
    // Minimal report data for deferred matches against current-run unmatched candidates
    private deferredMatchReportData: FusionReportAccount[] = []
    // Minimal report data for non-matches (avoids holding full FusionAccount objects)
    private analyzedNonMatchReportData: FusionReportAccount[] = []
    // Accounts where form creation failed (excessive candidates or runtime error)
    private failedMatchingAccounts: FusionReportAccount[] = []
    // Correlated identities seen with more than one Fusion account in the same run
    private conflictingFusionIdentityAccounts: Map<string, Map<string, string>> = new Map()
    private _reviewersBySourceId: Map<string, Set<FusionAccount>> = new Map()
    private _sourcesWithoutReviewers: Set<string> = new Set()
    private readonly sourcesByName: Map<string, SourceInfo> = new Map()
    private readonly reset: boolean
    private readonly reportAttributes: string[]
    private readonly urlContext: UrlContext
    private readonly deleteEmpty: boolean
    private readonly pendingDisableOperations: Set<Promise<void>> = new Set()
    public readonly fusionOwnerIsGlobalReviewer: boolean
    public readonly fusionReportOnAggregation: boolean
    public newManagedAccountsCount: number = 0
    public identitiesProcessedCount: number = 0
    private readonly managedAccountsBatchSize: number
    public readonly commandType?: StandardCommand
    private readonly currentRunUnmatchedFusionNativeIdentities: Set<string> = new Set()

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /**
     * @param config - Fusion configuration
     * @param log - Logger instance
     * @param identities - Identity service for identity lookups and correlation
     * @param sources - Source service for accessing source accounts and config
     * @param forms - Form service for creating and managing review forms
     * @param attributes - Attribute service for mapping and generating attributes
     * @param scoring - Scoring service for Match similarity scoring
     * @param schemas - Schema service for attribute schema lookups
     * @param commandType - The current SDK command type (e.g. StdAccountList)
     */
    constructor(
        private config: FusionConfig,
        private log: LogService,
        private identities: IdentityService,
        private sources: SourceService,
        private forms: FormService,
        private attributes: AttributeService,
        private scoring: ScoringService,
        private schemas: SchemaService,
        commandType?: StandardCommand
    ) {
        FusionAccount.configure(config)
        this.reset = config.reset
        this.fusionOwnerIsGlobalReviewer = config.fusionOwnerIsGlobalReviewer ?? false
        this.fusionReportOnAggregation = config.fusionReportOnAggregation ?? false
        this.reportAttributes = config.fusionFormAttributes ?? []
        this.urlContext = createUrlContext(config.baseurl)
        this.commandType = commandType
        this.deleteEmpty = config.deleteEmpty
        this.managedAccountsBatchSize = config.managedAccountsBatchSize ?? 50
    }

    // ------------------------------------------------------------------------
    // Public Reset/Configuration Methods
    // ------------------------------------------------------------------------

    /**
     * Checks if the reset flag is enabled in configuration.
     *
     * @returns true if a full reset was requested
     */
    public isReset(): boolean {
        return this.reset
    }

    /**
     * Retrieves a fusion identity from the in-memory map by ISC identity ID.
     *
     * @param identityId - The ISC identity ID to look up
     * @returns The fusion account for this identity, or undefined if not found
     */
    public getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.fusionIdentityMap.get(identityId)
    }

    /**
     * Disable the reset flag in the source configuration
     */
    public async disableReset(): Promise<void> {
        const fusionSourceId = this.sources.fusionSourceId
        const requestParameters = buildSourceConfigPatch(fusionSourceId, '/connectorAttributes/reset', false)
        await this.sources.patchSourceConfig(fusionSourceId, requestParameters, 'FusionService>disableReset')
    }

    /** Clears the persisted fusion state in the source configuration. */
    public async resetState(): Promise<void> {
        const fusionSourceId = this.sources.fusionSourceId
        const requestParameters = buildSourceConfigPatch(fusionSourceId, '/connectorAttributes/fusionState', false)
        await this.sources.patchSourceConfig(fusionSourceId, requestParameters, 'FusionService>resetState')
    }

    // ------------------------------------------------------------------------
    // Public Fusion Account Processing Methods
    // ------------------------------------------------------------------------

    /**
     * Pre-process all fusion accounts from sources.
     * Loads fusion accounts from the platform, builds FusionAccount instances, and registers them
     * in the internal maps (fusionIdentityMap / fusionAccountMap) via setFusionAccount.
     *
     * @returns Empty array (registration is done via setFusionAccount; return kept for API consistency)
     */
    public async preProcessFusionAccounts(): Promise<FusionAccount[]> {
        const fusionAccounts = this.sources.fusionAccounts
        this.log.debug(`Pre-processing ${fusionAccounts.length} fusion account(s)`)
        const results: FusionAccount[] = []
        await forEachBatched(fusionAccounts, async (x: Account) => {
            const fusionAccount = FusionAccount.fromFusionAccount(x)
            this.setFusionAccount(fusionAccount)
            results.push(fusionAccount)
        })
        return results
    }

    /**
     * Process all fusion accounts from sources.
     *
     * This is Phase 2 of the work queue depletion process:
     * - Phase 1: fetchFormData removes accounts with pending form decisions
     * - Phase 2: processFusionAccounts (this method) removes accounts belonging to existing fusion accounts
     * - Phase 3: processIdentities removes accounts belonging to identities
     * - Phase 4: processManagedAccounts processes only what remains (uncorrelated accounts)
     *
     * Each fusion account processes in parallel using Promise.all, but all share the same
     * work queue (this.sources.managedAccountsById). As accounts are matched, they're
     * deleted from the queue via addManagedAccountLayer.
     *
     * Memory Optimization:
     * - No snapshot or copy is made of managedAccountsById
     * - All parallel operations work with the direct reference
     * - Deletions physically remove accounts from memory as they're processed
     *
     * @returns Processed fusion accounts
     */
    public async processFusionAccounts(): Promise<FusionAccount[]> {
        const fusionAccounts = this.sources.fusionAccounts
        this.log.info(`Processing ${fusionAccounts.length} fusion account(s)`)
        const results = await promiseAllBatched(fusionAccounts, async (x: Account) => {
            return await this.processFusionAccount(x)
        })
        this.log.info('Fusion accounts processing completed')
        return results
    }

    /**
     * Reconcile transient entitlements derived from pending form instances.
     *
     * This is intended for StdAccountList runs:
     * - Clears any persisted/stale 'candidate' and reviewer 'reviews'
     * - Re-applies them only from currently-known pending (unanswered) form instances
     *
     * This is necessary because not all identities may originate from existing fusion accounts
     * (some can be created from Identity documents), and those would otherwise retain stale values.
     */
    public reconcilePendingFormState(): void {
        // Single source of truth: forms.pendingCandidateIdentityIds is populated from
        // pending form instance data (fetchFormData) AND from forms created in the
        // current run (createFusionForm). No other source should contribute candidate IDs.
        const pendingCandidateIds = this.forms.pendingCandidateIdentityIds
        const pendingReviewUrlsByReviewerId = this.forms.pendingReviewUrlsByReviewerId

        // Clear stale transient state for ALL accounts we may output.
        // Some accounts can be keyed in fusionAccountMap (e.g. missing/blank identityId or uncorrelated),
        // and would otherwise retain stale values forever.
        for (const account of this.fusionAccountMap.values()) {
            account.removeStatus('candidate')
            account.clearFusionReviews()
        }
        for (const identity of this.fusionIdentityMap.values()) {
            identity.removeStatus('candidate')
            identity.clearFusionReviews()
        }

        // Re-apply candidate status for identities that are candidates on active pending forms
        for (const identityId of pendingCandidateIds) {
            const identity = this.fusionIdentityMap.get(identityId)
            if (identity) {
                identity.addStatus('candidate')
            }
        }

        // Re-apply pending reviewer URLs for identities that are recipients of active pending forms
        for (const [reviewerId, urls] of pendingReviewUrlsByReviewerId.entries()) {
            const reviewer = this.fusionIdentityMap.get(reviewerId)
            if (!reviewer || !urls?.length) continue
            for (const url of urls) {
                reviewer.addFusionReview(url)
            }
        }

        // Sync the in-memory Sets back into each account's attribute bag so that
        // _attributeBag.current['statuses'] / ['reviews'] reflect the mutations above.
        // Without this, anything reading fusionAccount.attributes between now and
        // getISCAccount (attribute mapping, report generation, etc.) would see stale values.
        for (const account of this.fusionAccountMap.values()) {
            account.syncCollectionAttributesToBag()
        }
        for (const identity of this.fusionIdentityMap.values()) {
            identity.syncCollectionAttributesToBag()
        }
    }

    /**
     * Refresh unique attributes for all fusion accounts and identities in batches.
     */
    public async refreshUniqueAttributes(): Promise<void> {
        this.log.info('Refreshing unique attributes for all fusion accounts')
        const batchSize = this.managedAccountsBatchSize
        const allAccounts = [...this.fusionAccounts, ...this.fusionIdentities]
        while (allAccounts.length > 0) {
            const batch = allAccounts.splice(0, batchSize)
            await Promise.all(batch.map((account) => this.attributes.refreshUniqueAttributes(account)))
        }
    }

    /**
     * Process a single fusion account.
     *
     * This method builds a complete fusion account by layering data from multiple sources:
     * 1. Pre-process: Extract basic account info and set key
     * 2. Reviewer layer: Identify reviewers for this fusion account's sources
     * 3. Identity layer: Add identity document data
     * 4. Decision layer: Add any manual fusion decisions from forms
     * 5. Managed account layer: Find and attach managed accounts from work queue
     * 6. Attribute mapping and normal attribute definitions
     *
     * Attribute mapping and normal definitions are applied here, **before** the global
     * unique attribute refresh that runs after all accounts have been processed.  This
     * two-phase design means normal attributes are available for Fusion matching/scoring
     * while unique attributes are evaluated afterwards with full knowledge of every
     * account's normal attribute values.
     *
     * Work Queue Integration:
     * addManagedAccountLayer receives the direct reference to this.sources.managedAccountsById,
     * which is the shared work queue. As accounts are matched and processed, they're deleted
     * from the queue to prevent duplicate processing in later phases.
     *
     * @param account - The fusion account from the platform
     * @param attributeOperations - Flags controlling which attribute operations to perform
     * @returns Processed FusionAccount with all layers applied
     */
    public async processFusionAccount(
        account: Account,
        attributeOperations: AttributeOperations = {
            refreshMapping: false,
            refreshDefinition: false,
            resetDefinition: false,
        }
    ): Promise<FusionAccount> {
        const { refreshMapping, refreshDefinition, resetDefinition } = attributeOperations
        const fusionAccount = FusionAccount.fromFusionAccount(account)
        this.log.debug(
            `Pre-processing fusion account: ${fusionAccount.name} (${account.nativeIdentity}), ` +
            `identityId=${fusionAccount.identityId ?? 'none'}, disabled=${fusionAccount.disabled}, uncorrelated=${fusionAccount.uncorrelated}`
        )

        assert(this.sources.managedAccountsById, 'Managed accounts have not been loaded')

        // Use for...of instead of forEach for better performance
        let isReviewer = false
        for (const sourceId of fusionAccount.listReviewerSources()) {
            this.setReviewerForSource(fusionAccount, sourceId)
            isReviewer = true
        }
        if (isReviewer) {
            this.populateReviewerFusionReviewsFromPending(fusionAccount)
        }

        let hasDecisionAssignment = false
        const isIdentity = !account.uncorrelated && account.identityId
        if (isIdentity) {
            const identityId = account.identityId!
            const identity = this.identities.getIdentityById(identityId)
            if (identity) {
                fusionAccount.addIdentityLayer(identity)
            }

            const fusionDecision = this.forms.getFusionAssignmentDecision(identityId)
            if (fusionDecision) {
                fusionAccount.addFusionDecisionLayer(fusionDecision)
                hasDecisionAssignment = true
            }
            this.log.debug(`Applied identity layer for ${fusionAccount.name}: identityId=${identityId}`)
        }

        // Pass direct reference to work queue - deletions will remove processed accounts
        // No snapshot or copy needed: JavaScript's event loop ensures atomic operations
        fusionAccount.addManagedAccountLayer(
            this.sources.managedAccountsById,
            this.sources.managedAccountsByIdentityId,
            this.sources.managedAccountsAllById,
            this.shouldPruneDeletedManagedAccounts()
        )
        this.log.debug(
            `Applied managed account layer for ${fusionAccount.name}: ` +
            `${fusionAccount.accountIds.length} account(s), ${fusionAccount.missingAccountIds.length} missing`
        )

        if (!resetDefinition) {
            await this.attributes.registerUniqueAttributes(fusionAccount)
        }

        fusionAccount.setNeedsRefresh(fusionAccount.needsRefresh || refreshDefinition || refreshMapping)
        fusionAccount.setNeedsReset(resetDefinition)

        this.attributes.mapAttributes(fusionAccount)
        await this.attributes.refreshNormalAttributes(fusionAccount)

        // Per-source correlation for missing accounts during aggregation
        await this.applyPerSourceCorrelationIfNeeded(fusionAccount, hasDecisionAssignment)

        // Sync _uncorrelated flag with actual _missingAccountIds state so that
        // setFusionAccount routes the account to the correct map (fusionIdentityMap
        // vs fusionAccountMap). Without this, optimistic correlations from
        // correlatePerSource leave _uncorrelated stale.
        fusionAccount.updateCorrelationStatus()

        this.log.debug(
            `Completed processing fusion account: ${fusionAccount.name}, ` +
            `needsRefresh=${fusionAccount.needsRefresh}, sources=[${fusionAccount.sources.join(', ')}]`
        )

        this.setFusionAccount(fusionAccount)

        return fusionAccount
    }

    // ------------------------------------------------------------------------
    // Per-Source Correlation
    // ------------------------------------------------------------------------

    /**
     * Apply per-source correlation logic for missing accounts on a fusion account.
     *
     * Groups missing accounts by source and applies the correlation strategy
     * configured for each source:
     * - `correlate`: Direct API correlation (PATCH /identityId)
     * - `reverse`: Set the dedicated Fusion attribute to the first missing account name
     * - `none`: Skip correlation
     *
     * Decision-assigned accounts always use direct correlation regardless of mode.
     */
    private async correlatePerSource(fusionAccount: FusionAccount, hasDecisionAssignment: boolean): Promise<void> {
        const missingIds = fusionAccount.missingAccountIds
        const validatedReverseSources = new Set<string>()
        const canDirectCorrelate = Boolean(fusionAccount.identityId)

        // Separate decision-assigned accounts (always use direct correlation)
        const directCorrelateIds: string[] = []
        const bySource = new Map<string, string[]>()

        for (const accountId of missingIds) {
            const info = fusionAccount.getManagedAccountInfo(accountId)
            if (!info) {
                // No source info available; if there's a decision, correlate directly
                if (hasDecisionAssignment) {
                    directCorrelateIds.push(accountId)
                }
                continue
            }

            const sourceConfig = this.sources.getSourceConfig(info.sourceName)
            const mode = sourceConfig?.correlationMode ?? 'none'

            if (mode === 'correlate') {
                if (canDirectCorrelate) {
                    directCorrelateIds.push(accountId)
                }
            } else if (mode === 'reverse') {
                let ids = bySource.get(info.sourceName)
                if (!ids) {
                    ids = []
                    bySource.set(info.sourceName, ids)
                }
                ids.push(accountId)
            }
            // mode === 'none': skip
        }

        // If there's a decision assignment, ensure ALL missing accounts are directly correlated
        if (hasDecisionAssignment && canDirectCorrelate) {
            for (const accountId of missingIds) {
                if (!directCorrelateIds.includes(accountId)) {
                    directCorrelateIds.push(accountId)
                }
            }
        }

        // Direct correlation
        if (directCorrelateIds.length > 0) {
            await this.identities.correlateAccounts(fusionAccount, directCorrelateIds)
        }

        // Reverse correlation: set attribute to first missing account name per source
        for (const [sourceName, accountIds] of bySource) {
            // Skip reverse correlation for decision-assigned accounts (already handled above)
            if (hasDecisionAssignment) continue

            const sourceConfig = this.sources.getSourceConfig(sourceName)
            if (!sourceConfig?.correlationAttribute) continue
            if (!validatedReverseSources.has(sourceName)) {
                await this.sources.assertReverseCorrelationReady(sourceConfig)
                validatedReverseSources.add(sourceName)
            }

            const firstAccountId = accountIds[0]
            const info = fusionAccount.getManagedAccountInfo(firstAccountId)
            if (info) {
                fusionAccount.setReverseCorrelationAttribute(sourceConfig.correlationAttribute, info.nativeIdentity)
                this.log.debug(
                    `Set reverse correlation attribute "${sourceConfig.correlationAttribute}" = "${info.nativeIdentity}" ` +
                    `for fusion account ${fusionAccount.name} (source: ${sourceName}, ${accountIds.length} missing)`
                )
            }
        }

        // Clear reverse correlation attributes for sources with no missing accounts
        const hasUnknownMissingSourceInfo = missingIds.some(
            (accountId) => !fusionAccount.getManagedAccountInfo(accountId)
        )
        for (const sc of this.config.sources) {
            if (sc.correlationMode === 'reverse' && sc.correlationAttribute) {
                if (hasUnknownMissingSourceInfo) {
                    continue
                }
                const missingForSource = fusionAccount.getMissingAccountIdsForSource(sc.name)
                if (missingForSource.length === 0) {
                    fusionAccount.clearReverseCorrelationAttribute(sc.correlationAttribute)
                }
            }
        }
    }

    /**
     * Apply per-source correlation only during account-list aggregation when there are missing accounts.
     */
    private async applyPerSourceCorrelationIfNeeded(
        fusionAccount: FusionAccount,
        hasDecisionAssignment: boolean = false
    ): Promise<void> {
        if (this.commandType !== StandardCommand.StdAccountList) return
        if (fusionAccount.missingAccountIds.length === 0) return
        await this.correlatePerSource(fusionAccount, hasDecisionAssignment)
    }

    // ------------------------------------------------------------------------
    // Public Identity Processing Methods
    // ------------------------------------------------------------------------

    /**
     * Process all identities.
     *
     * This is Phase 3 of the work queue depletion process:
     * - Phase 1: fetchFormData removes accounts with pending form decisions
     * - Phase 2: processFusionAccounts removes accounts belonging to existing fusion accounts
     * - Phase 3: processIdentities (this method) removes accounts belonging to identities
     * - Phase 4: processManagedAccounts processes only what remains (uncorrelated accounts)
     *
     * For identities that don't have a corresponding fusion account yet, this creates a
     * fusion account from the identity and attaches any managed accounts that belong to it.
     * Matched accounts are deleted from the work queue.
     *
     * @returns Fusion accounts for identities that did not already have one
     */
    public async processIdentities(): Promise<FusionAccount[]> {
        const { identities } = this.identities
        this.identitiesProcessedCount = identities.length
        this.log.info(`Processing ${identities.length} identities`)
        const results = await promiseAllBatched(identities, (x) => this.processIdentity(x))
        const { managedSources } = this.sources
        managedSources.forEach((source) => {
            this.sourcesByName.set(source.name, source)
        })

        if (this.fusionOwnerIsGlobalReviewer) {
            const { fusionSourceOwner } = this.sources

            const globalReviewer = this.fusionIdentityMap.get(fusionSourceOwner.id!)
            if (globalReviewer) {
                managedSources.forEach((source) => {
                    this.setReviewerForSource(globalReviewer, source.id!)
                })
                this.populateReviewerFusionReviewsFromPending(globalReviewer)
            }
        }
        this.log.info('Identities processing completed')
        return compact(results)
    }

    /**
     * Process a single identity.
     *
     * Creates a fusion account from an identity document if one doesn't already exist.
     * This handles identities that don't have a pre-existing fusion account record.
     *
     * Before creating a new baseline account, checks whether an existing Fusion account
     * in fusionAccountMap or fusionIdentityMap already covers this identity's managed
     * accounts. This prevents a competing duplicate baseline account from being created
     * when an ISC identity is destroyed and recreated (e.g. after a display-attribute
     * change triggers identity recreation), which would otherwise cause the original
     * Fusion account to be orphaned and a new one to lose all generated unique attributes.
     *
     * Work Queue Integration:
     * Passes direct reference to the work queue so managed accounts belonging to this
     * identity can be matched and removed from the queue, preventing duplicate processing.
     *
     * @param identity - Identity document from the platform
     * @returns The fusion account produced, or undefined if identity was skipped or already had one
     */
    public async processIdentity(identity: IdentityDocument): Promise<FusionAccount | undefined> {
        const { fusionDisplayAttribute } = this.schemas
        const identityId = identity.id

        if (!this.fusionIdentityMap.has(identityId)) {
            // Check whether an existing Fusion account already covers this identity's managed
            // accounts before creating a new baseline. This handles two scenarios:
            //   1. An uncorrelated account in fusionAccountMap (e.g. previously unmatched from
            //      a managed account that now belongs to this identity).
            //   2. A stale account in fusionIdentityMap whose identity was destroyed and recreated
            //      (old identityId no longer maps to a live ISC identity, but the Fusion account
            //      still holds references to the managed accounts now correlated to this identity).
            const existingAccount = this.findFusionAccountByIdentityManagedAccounts(identity)
            if (existingAccount) {
                this.log.debug(
                    `Reusing existing Fusion account ${existingAccount.nativeIdentity} for identity ` +
                    `${identity.name} (${identityId}) - prevents duplicate baseline creation`
                )
                // Remove from whichever map currently holds it
                if (this.fusionAccountMap.get(existingAccount.nativeIdentity) === existingAccount) {
                    this.fusionAccountMap.delete(existingAccount.nativeIdentity)
                } else {
                    for (const [staleId, fa] of this.fusionIdentityMap.entries()) {
                        if (fa === existingAccount) {
                            this.fusionIdentityMap.delete(staleId)
                            break
                        }
                    }
                }
                // Update identity reference; refresh mapping/normal defs but preserve unique attrs
                existingAccount.addIdentityLayer(identity)
                existingAccount.setNeedsRefresh(true)
                // Register under the new identity ID so callers (e.g. getFusionIdentity) can find it
                this.fusionIdentityMap.set(identityId, existingAccount)
                this.log.debug(`Re-registered existing Fusion account under new identity: ${identity.name} (${identityId})`)
                return existingAccount
            }

            const fusionAccount = FusionAccount.fromIdentity(identity)
            this.log.debug(`Processing new identity: ${identity.name} (${identityId})`)
            fusionAccount.addIdentityLayer(identity)
            // New fusion accounts should regenerate unique attributes even when
            // mapping pre-populates those fields, so uniqueness is enforced.
            fusionAccount.setNeedsReset(true)

            assert(this.sources.managedAccountsById, 'Managed accounts have not been loaded')
            // Pass direct reference to work queue - deletions will remove processed accounts
            fusionAccount.addManagedAccountLayer(
                this.sources.managedAccountsById,
                this.sources.managedAccountsByIdentityId,
                this.sources.managedAccountsAllById,
                this.shouldPruneDeletedManagedAccounts()
            )

            this.attributes.mapAttributes(fusionAccount)
            await this.attributes.refreshNormalAttributes(fusionAccount)

            // Set display attribute using the attributes getter
            fusionAccount.attributes[fusionDisplayAttribute] = identity.name

            // Key generation deferred until getISCAccount
            this.setFusionAccount(fusionAccount)
            this.log.debug(`Registered identity as fusion account: ${identity.name} (${identityId})`)
            return fusionAccount
        }
        return undefined
    }

    /**
     * Finds an existing Fusion account whose managed accounts overlap with the given
     * identity's managed source accounts.
     *
     * Searches fusionAccountMap first (uncorrelated accounts), then fusionIdentityMap
     * (accounts that may be keyed under a stale/destroyed identity ID).
     * Called from processIdentity to avoid creating a duplicate baseline account when
     * an ISC identity is recreated with a new ID.
     */
    private findFusionAccountByIdentityManagedAccounts(identity: IdentityDocument): FusionAccount | undefined {
        const sourceNames = new Set(this.config.sources.map((s) => s.name))
        const identityAccountIds = new Set<string>(
            (identity.accounts ?? [])
                .filter((a) => sourceNames.has(a.source?.name ?? ''))
                .map((a) => a.id!)
                .filter(Boolean)
        )
        if (identityAccountIds.size === 0) return undefined

        // Check uncorrelated accounts first
        for (const account of this.fusionAccountMap.values()) {
            const allIds = [...account.accountIds, ...account.missingAccountIds]
            if (allIds.some((id) => identityAccountIds.has(id))) {
                return account
            }
        }

        // Check for accounts from stale identity IDs (identity was destroyed and recreated)
        for (const [existingIdentityId, account] of this.fusionIdentityMap.entries()) {
            if (existingIdentityId === identity.id) continue
            const allIds = [...account.accountIds, ...account.missingAccountIds]
            if (allIds.some((id) => identityAccountIds.has(id))) {
                return account
            }
        }

        return undefined
    }

    /**
     * Process all fusion identity decisions (new identity).
     * Candidate status is handled by processFusionAccounts, since pending form
     * candidates are always existing fusion accounts.
     *
     * @returns The fusion accounts produced by the new identity decisions
     */
    public async processFusionIdentityDecisions(): Promise<FusionAccount[]> {
        const { fusionIdentityDecisions } = this.forms
        this.log.info(`Processing ${fusionIdentityDecisions.length} fusion identity decision(s)`)

        const results = await promiseAllBatched(fusionIdentityDecisions, (x) => this.processFusionIdentityDecision(x))
        this.log.info('Fusion identity decisions processing completed')
        return compact(results)
    }

    /**
     * Processes a single fusion identity decision (reviewer form response).
     * Creates a new fusion identity for "new identity" decisions, or merges
     * into an existing one for "authorized" decisions.
     *
     * For record/orphan source types, "new identity" (toggle true) means "no match":
     * - record: registers unique attributes but does not output as ISC account
     * - orphan: drops the account; optionally fires a disable operation
     *
     * @param fusionDecision - The reviewer's decision from the review form
     * @returns The fusion account produced or updated, or undefined if the decision was skipped
     */
    public async processFusionIdentityDecision(fusionDecision: FusionDecision): Promise<FusionAccount | undefined> {
        const sourceType = fusionDecision.sourceType ?? 'authoritative'
        let selectedIdentity: IdentityDocument | undefined

        // Enrich submitter and selected identity display names for user-facing output:
        // - FusionAccount history strings (created here) use decision.submitter.name/email
        // - Fusion report decisions section prefers decision.identityName/submitter.name when present
        const submitterId = fusionDecision.submitter?.id
        if (submitterId) {
            const hasSubmitterLabel = Boolean(fusionDecision.submitter?.name || fusionDecision.submitter?.email)
            if (!hasSubmitterLabel) {
                try {
                    const cached = this.identities.getIdentityById(submitterId)
                    const identity = cached ?? (await this.identities.fetchIdentityById(submitterId))
                    const label = identity?.displayName || identity?.name
                    if (label) {
                        fusionDecision.submitter.name = label
                    }
                } catch {
                    // Best-effort: fall back to submitterId if fetch fails
                }
            }
        }

        // Prefer identity display name over ID in reports when identityName is missing.
        if (fusionDecision.identityId && !fusionDecision.identityName) {
            try {
                const cached = this.identities.getIdentityById(fusionDecision.identityId)
                const identity = cached ?? (await this.identities.fetchIdentityById(fusionDecision.identityId))
                selectedIdentity = identity
                const label = identity?.displayName || identity?.name
                if (label) {
                    fusionDecision.identityName = label
                }
            } catch {
                // Best-effort: leave identityName undefined if fetch fails
            }
        }

        // Any reviewer "authorized" action already records a user-facing decision message.
        // Suppress the generic "Associated managed account ..." history line for all of them,
        // even when identityId is missing (edge-case form payloads).
        const isAuthorizedDecision = !fusionDecision.newIdentity
        const existingIdentityAccount =
            isAuthorizedDecision && fusionDecision.identityId
                ? this.fusionIdentityMap.get(fusionDecision.identityId)
                : undefined
        const fusionAccount = existingIdentityAccount ?? FusionAccount.fromFusionDecision(fusionDecision)
        this.log.debug(
            `${existingIdentityAccount ? 'Reusing' : 'Created'} fusion account from decision: ` +
                `${fusionDecision.account.name} [${fusionDecision.account.sourceName}], ` +
                `newIdentity=${fusionDecision.newIdentity}, sourceType=${sourceType}`
        )

        // For authorized decisions (including synthetic perfect-match auto-correlation),
        // hydrate the selected identity so per-source direct correlation can execute now.
        if (isAuthorizedDecision && fusionDecision.identityId) {
            if (!selectedIdentity) {
                try {
                    selectedIdentity =
                        this.identities.getIdentityById(fusionDecision.identityId) ??
                        (await this.identities.fetchIdentityById(fusionDecision.identityId))
                } catch {
                    // Best-effort: if identity fetch fails, continue without immediate correlation.
                }
            }
            if (selectedIdentity) {
                fusionAccount.addIdentityLayer(selectedIdentity)
            }
        }

        // Only new-identity decisions should force a full reset. Authorized decisions
        // must preserve immutable mapped fields (for example display/account name).
        fusionAccount.setNeedsReset(Boolean(fusionDecision.newIdentity))
        fusionAccount.addFusionDecisionLayer(fusionDecision)
        const suppressAssociationHistoryForAuthorizedDecision = isAuthorizedDecision
        fusionAccount.addManagedAccountLayer(
            this.sources.managedAccountsById,
            this.sources.managedAccountsByIdentityId,
            this.sources.managedAccountsAllById,
            this.shouldPruneDeletedManagedAccounts(),
            !suppressAssociationHistoryForAuthorizedDecision
        )
        this.attributes.mapAttributes(fusionAccount)
        await this.attributes.refreshNormalAttributes(fusionAccount)

        if (isAuthorizedDecision) {
            await this.applyPerSourceCorrelationIfNeeded(fusionAccount, true)
            this.setFusionAccount(fusionAccount)
        }

        if (fusionDecision.newIdentity) {
            if (sourceType === 'record') {
                this.log.debug(
                    `Record no-match decision for ${fusionDecision.account.name}, registering unique attributes only`
                )
                await this.attributes.registerUniqueAttributes(fusionAccount)
                return undefined
            }
            if (sourceType === 'orphan') {
                this.log.debug(`Orphan no-match decision for ${fusionDecision.account.name}, dropping`)
                const sourceInfo = this.sourcesByName.get(fusionDecision.account.sourceName)
                if (sourceInfo?.config?.disableNonMatchingAccounts) {
                    const managedAccount = this.sources.managedAccountsById.get(fusionDecision.account.id)
                    if (managedAccount) {
                        this.queueDisableOperation(managedAccount)
                    }
                }
                return undefined
            }
            // authoritative (default): register as new fusion account
            this.setFusionAccount(fusionAccount)
            this.log.debug(
                `Registered decision account as fusion account: ${fusionDecision.account.name} ` +
                `[${fusionDecision.account.sourceName}] (${fusionDecision.account.id})`
            )
        }
        return fusionAccount
    }

    // ------------------------------------------------------------------------
    // Public Managed Account Processing Methods
    // ------------------------------------------------------------------------

    /**
     * Process all managed accounts.
     *
     * This is Phase 4 (final phase) of the work queue depletion process:
     * - Phase 1: fetchFormData removes accounts with pending form decisions
     * - Phase 2: processFusionAccounts removes accounts belonging to existing fusion accounts
     * - Phase 3: processIdentities removes accounts belonging to identities
     * - Phase 4: processManagedAccounts (this method) processes ONLY what remains
     *
     * At this point, the work queue (this.sources.managedAccountsById) contains ONLY
     * uncorrelated accounts that don't belong to any existing fusion account or identity.
     * These are the truly new accounts that need Match review.
     *
     * The work queue pattern ensures:
     * - No duplicate processing (accounts are physically removed as they're claimed)
     * - Efficient filtering (no need to re-check thousands of already-processed accounts)
     * - Clear ownership (each account is processed exactly once)
     *
     * Memory Efficiency:
     * - Iterates Map directly (no 60k+ array allocation)
     * - Configurable batch size (managedAccountsBatchSize, default 50) limits concurrent in-flight objects
     * - Non-matches store minimal report data; full FusionAccount only for matches
     * - Arrays cleared by generateReport() or clearAnalyzedAccounts() after use
     * - Processes managed accounts sequentially so newly-unmatched accounts from the
     *   same run are immediately available as deferred-match candidates for subsequent
     *   managed accounts.
     *
     * @returns Empty array (side effects register accounts in fusionAccountMap/fusionIdentityMap)
     */
    public async processManagedAccounts(): Promise<void> {
        const map = this.sources.managedAccountsById
        assert(map, 'Managed accounts have not been loaded')
        this.newManagedAccountsCount = map.size
        this.currentRunUnmatchedFusionNativeIdentities.clear()

        this._sourcesWithoutReviewers = new Set()
        for (const source of this.sources.managedSources) {
            const reviewers = this._reviewersBySourceId.get(source.id)
            if (!reviewers || reviewers.size === 0) {
                this._sourcesWithoutReviewers.add(source.name)
                this.log.error(
                    `No valid reviewer configured for source "${source.name}". ` +
                    `Managed accounts from this source will be treated as unmatched.`
                )
            }
        }

        this.log.info(`Processing ${map.size} managed account(s)`)
        let processed = 0
        for (const account of map.values()) {
            await this.processManagedAccount(account)
            processed += 1
            if (processed % this.managedAccountsBatchSize === 0) {
                await new Promise((resolve) => setImmediate(resolve))
            }
        }
        this.log.info('Managed accounts processing completed')
    }

    /**
     * Wait for all pending asynchronous disable operations to complete.
     * Safe to call multiple times; it drains the current pending set.
     */
    public async awaitPendingDisableOperations(): Promise<void> {
        if (this.pendingDisableOperations.size === 0) {
            return
        }

        this.log.info(`Waiting for ${this.pendingDisableOperations.size} pending disable operation(s)`)
        while (this.pendingDisableOperations.size > 0) {
            const pending = Array.from(this.pendingDisableOperations)
            await Promise.allSettled(pending)
        }
        this.log.info('Pending disable operations completed')
    }

    /**
     * Processes a single uncorrelated managed account through the Match workflow.
     * After scoring, the account is either auto-correlated (perfect match), sent for
     * manual review (partial match), or handled based on the source type:
     * - authoritative: added as unmatched new identity (output as ISC account)
     * - record: unique attributes registered but not output as ISC account
     * - orphan: dropped immediately; optionally fires a disable operation
     *
     * @param account - The uncorrelated ISC account from a managed source
     * @returns The fusion account produced or updated, or undefined if skipped or sent for manual review
     */
    public async processManagedAccount(account: Account): Promise<FusionAccount | undefined> {
        const sourceInfo = this.sourcesByName.get(account.sourceName ?? '')
        const sourceType = sourceInfo?.sourceType ?? 'authoritative'

        if (account.sourceName && this._sourcesWithoutReviewers.has(account.sourceName)) {
            const fusionAccount = await this.preProcessManagedAccount(account)
            if (sourceType !== 'authoritative') {
                this.log.debug(
                    `Account ${account.name} [${fusionAccount.sourceName}] has no reviewers and sourceType=${sourceType}, skipping`
                )
                if (sourceType === 'record') {
                    await this.attributes.registerUniqueAttributes(fusionAccount)
                } else if (sourceType === 'orphan' && sourceInfo?.config?.disableNonMatchingAccounts) {
                    this.queueDisableOperation(account)
                }
                return undefined
            }
            return await this.finalizeAuthoritativeUnmatched(fusionAccount)
        }

        const fusionAccount = await this.analyzeManagedAccount(account)
        const hasIdentityBackedMatches = this.hasIdentityBackedMatches(fusionAccount)
        const hasDeferredUnmatchedMatches = this.hasDeferredUnmatchedMatches(fusionAccount)

        if (hasIdentityBackedMatches) {
            const perfectMatch = fusionAccount.fusionMatches.find((m) => FusionService.hasAllAttributeScoresPerfect(m))
            const identityId = perfectMatch?.identityId
            if (this.config.fusionMergingIdentical && identityId) {
                this.removePotentialMatchAccount(fusionAccount.managedAccountId)
                this.log.debug(
                    `Account ${account.name} [${fusionAccount.sourceName}] has all scores 100, auto-correlating to identity ${identityId}`
                )
                const syntheticDecision = this.createAutoCorrelationDecision(fusionAccount, account, identityId)
                this.forms.registerFinishedDecision(syntheticDecision)
                return await this.processFusionIdentityDecision(syntheticDecision)
            } else {
                assert(sourceInfo, 'Source info not found')
                const reviewers = this.reviewersBySourceId.get(sourceInfo.id!)
                try {
                    const formCreated = await this.forms.createFusionForm(fusionAccount, reviewers)
                    if (!formCreated) {
                        const candidateCount = fusionAccount.fusionMatches.length
                        this.trackFailedMatching(
                            fusionAccount,
                            `Too many candidates (${candidateCount}) - maximum is ${MAX_CANDIDATES_FOR_FORM}`
                        )
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    this.trackFailedMatching(fusionAccount, `Form creation failed: ${message}`)
                }
                this.flagCandidatesWithStatus(fusionAccount)
                fusionAccount.clearFusionIdentityReferences()
                return undefined
            }
        } else if (hasDeferredUnmatchedMatches) {
            this.log.info(
                `DEFERRED MATCH FOUND: ${account.name} [${account.sourceName}] - waiting for identity correlation on next aggregation`
            )
            return undefined
        } else {
            // Non-match handling varies by source type
            if (sourceType === 'record') {
                await this.attributes.registerUniqueAttributes(fusionAccount)
                return undefined
            }

            if (sourceType === 'orphan') {
                if (sourceInfo?.config?.disableNonMatchingAccounts) {
                    this.queueDisableOperation(account)
                }
                return undefined
            }

            // authoritative (default)
            await this.finalizeAuthoritativeUnmatched(fusionAccount)
            this.log.debug(
                `Registered managed account as fusion account: ${account.name} [${account.sourceName}] (${account.id})`
            )
            return fusionAccount
        }
    }

    /**
     * Returns true when all attribute similarity scores in the match are 100 (perfect match).
     * Excludes the synthetic 'average' score when overall scoring is used.
     *
     * @param match - The fusion match to check
     * @returns true if all attribute scores are 100
     */
    private static hasAllAttributeScoresPerfect(match: FusionMatch): boolean {
        const attributeScores = match.scores.filter((s) => s.algorithm !== 'average')
        return attributeScores.length > 0 && attributeScores.every((s) => s.score === 100)
    }

    /**
     * Builds a synthetic fusion decision for auto-correlation when all attribute scores are 100.
     *
     * @param fusionAccount - The fusion account being correlated
     * @param account - The managed account
     * @param identityId - The target identity ID
     * @returns Synthetic FusionDecision for auto-correlation
     */
    private createAutoCorrelationDecision(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): FusionDecision {
        return {
            submitter: { id: 'system', email: '', name: 'System (auto-correlated)' },
            account: {
                id: fusionAccount.managedAccountId!,
                name: fusionAccount.name ?? account.name ?? '',
                sourceName: fusionAccount.sourceName,
            },
            newIdentity: false,
            identityId,
            comments: 'Auto-correlated: all attribute scores were 100',
            finished: true,
        }
    }

    /**
     * Analyze all managed accounts and return an array of FusionAccount.
     * Used by on-demand report generation (non-StdAccountList path).
     * Iterates Map directly to avoid materializing a large array.
     * Runs sequentially to preserve deferred-candidate visibility between managed accounts.
     *
     * @returns Array of FusionAccount with match results populated for each
     */
    public async analyzeManagedAccounts(): Promise<FusionAccount[]> {
        const map = this.sources.managedAccountsById
        assert(map, 'Managed accounts have not been loaded')
        const results: FusionAccount[] = []
        let processed = 0
        for (const account of map.values()) {
            results.push(await this.analyzeManagedAccount(account))
            processed += 1
            if (processed % this.managedAccountsBatchSize === 0) {
                await new Promise((resolve) => setImmediate(resolve))
            }
        }
        return results
    }

    /**
     * Analyzes a single managed account by scoring it against all existing fusion identities.
     * Tracks the account for reporting when reporting is enabled.
     *
     * Memory: Only populates potentialMatchAccounts/analyzedNonMatchReportData when
     * fusionReportOnAggregation is true or on-demand report (non-StdAccountList).
     * Stores minimal FusionReportAccount for non-matches when report data is needed.
     *
     * @param account - The managed source account to analyze
     * @returns The scored FusionAccount with match results populated
     */
    public async analyzeManagedAccount(account: Account): Promise<FusionAccount> {
        const { name, sourceName } = account
        const fusionAccount = await this.preProcessManagedAccount(account)
        const sourceType = this.sourcesByName.get(account.sourceName ?? '')?.sourceType ?? 'authoritative'
        this.scoring.scoreFusionAccount(fusionAccount, this.fusionIdentities, 'identity')
        const hasIdentityBackedMatches = this.hasIdentityBackedMatches(fusionAccount)
        if (!hasIdentityBackedMatches) {
            this.scoring.scoreFusionAccount(fusionAccount, this.currentRunUnmatchedCandidates, 'new-unmatched')
        }

        if (fusionAccount.isMatch) {
            const matchCount = fusionAccount.fusionMatches.length
            if (hasIdentityBackedMatches) {
                this.log.info(`POTENTIAL MATCH FOUND: ${name} [${sourceName}] - ${matchCount} candidate(s)`)
            } else {
                this.log.info(`DEFERRED POTENTIAL MATCH FOUND: ${name} [${sourceName}] - ${matchCount} candidate(s)`)
            }

            // Keep full FusionAccount for report when reporting is enabled (aggregation) or on-demand report
            if (this.fusionReportOnAggregation || this.commandType !== StandardCommand.StdAccountList) {
                if (hasIdentityBackedMatches) {
                    this.potentialMatchAccounts.push(fusionAccount)
                } else {
                    const deferredMatches = fusionAccount.fusionMatches
                        .filter((match) => match.candidateType === 'new-unmatched')
                        .map((match) => ({
                            identityName: match.identityName,
                            identityId: undefined,
                            identityUrl: undefined,
                            isMatch: true,
                            candidateType: 'new-unmatched' as const,
                            scores: match.scores.map((score) => ({
                                attribute: score.attribute,
                                algorithm: score.algorithm,
                                score: parseFloat(score.score.toFixed(2)),
                                fusionScore: score.fusionScore,
                                isMatch: score.isMatch,
                                comment: score.comment,
                            })),
                        }))
                    this.deferredMatchReportData.push(
                        {
                            ...buildMinimalFusionReportAccount(
                                fusionAccount,
                                this.urlContext,
                                this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                                this.reportAttributes
                            ),
                            deferred: true,
                            matches: deferredMatches,
                        }
                    )
                }
            }
        } else {
            this.log.debug(`No match found for managed account: ${name} [${sourceName}]`)
            if (sourceType === 'authoritative') {
                // Keep current-run authoritative non-matches available as deferred candidates
                // for subsequent managed-account analysis in custom:report.
                this.registerCurrentRunUnmatchedCandidate(fusionAccount)
            }
            // Store minimal report data when reporting is enabled or on-demand report
            if (this.fusionReportOnAggregation || this.commandType !== StandardCommand.StdAccountList) {
                this.analyzedNonMatchReportData.push(
                    buildMinimalFusionReportAccount(
                        fusionAccount,
                        this.urlContext,
                        this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                        this.reportAttributes
                    )
                )
            }
        }

        return fusionAccount
    }

    /**
     * Records a failed matching for inclusion in the fusion report.
     * Called when form creation fails (excessive candidates or runtime error).
     */
    private trackFailedMatching(fusionAccount: FusionAccount, error: string): void {
        this.log.error(`Failed matching for account ${fusionAccount.name} [${fusionAccount.sourceName}]: ${error}`)
        if (this.fusionReportOnAggregation || this.commandType !== StandardCommand.StdAccountList) {
            this.failedMatchingAccounts.push(
                buildMinimalFusionReportAccount(
                    fusionAccount,
                    this.urlContext,
                    this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                    this.reportAttributes,
                    error
                )
            )
        }
    }

    /**
     * Removes an account from potential-match reporting when it is auto-correlated.
     * This prevents "manual review" report sections from showing resolved perfect matches.
     */
    private removePotentialMatchAccount(managedAccountId?: string): void {
        if (!managedAccountId) return
        this.potentialMatchAccounts = this.potentialMatchAccounts.filter((x) => x.managedAccountId !== managedAccountId)
    }

    // ------------------------------------------------------------------------
    // Public Cleanup Methods
    // ------------------------------------------------------------------------

    /**
     * Clear analyzed managed account arrays to free memory.
     *
     * Memory Optimization:
     * analyzedNonMatchReportData and potentialMatchAccounts accumulate during
     * processManagedAccounts. They are also cleared inside generateReport(), but
     * when fusionReportOnAggregation is false, generateReport is never called and
     * these arrays would persist for the lifetime of the operation. This method
     * ensures they are always released regardless of report configuration.
     *
     * Safe to call multiple times (idempotent).
     */
    public clearAnalyzedAccounts(): void {
        if (
            this.analyzedNonMatchReportData.length > 0 ||
            this.potentialMatchAccounts.length > 0 ||
            this.deferredMatchReportData.length > 0 ||
            this.failedMatchingAccounts.length > 0 ||
            this.conflictingFusionIdentityAccounts.size > 0
        ) {
            this.log.debug('Clearing analyzed managed accounts from memory')
            this.analyzedNonMatchReportData = []
            this.potentialMatchAccounts = []
            this.deferredMatchReportData = []
            this.failedMatchingAccounts = []
            this.conflictingFusionIdentityAccounts = new Map()
        }
    }

    // ------------------------------------------------------------------------
    // Public Output/Listing Methods
    // ------------------------------------------------------------------------

    /**
     * Lists all ISC accounts (fusion accounts and identity accounts) for platform output.
     * Optionally filters out orphan accounts when deleteEmpty is enabled.
     *
     * Performance Optimization:
     * - Iterates Maps directly instead of creating intermediate arrays
     * - Uses promiseAllBatched to bound concurrent getISCAccount calls
     * - Avoids spread operator to combine arrays
     *
     * @returns Array of formatted account outputs ready for the platform
     */
    public async listISCAccounts(): Promise<StdAccountListOutput[]> {
        const shouldFilter = this.deleteEmpty
        const eligible: FusionAccount[] = []

        for (const account of this.fusionAccountMap.values()) {
            if (!shouldFilter || !account.isOrphan()) {
                eligible.push(account)
            }
        }
        for (const identity of this.fusionIdentityMap.values()) {
            if (!shouldFilter || !identity.isOrphan()) {
                eligible.push(identity)
            }
        }

        const results = await promiseAllBatched(eligible, (x) => this.getISCAccount(x))
        return compact(results)
    }

    /**
     * Streams each ISC account to the provided callback as soon as it's ready.
     * Memory optimization: avoids accumulating the full output array - processes
     * and sends one at a time instead of building the whole array first.
     *
     * @param send - Callback invoked with each account output (e.g. res.send)
     * @returns Number of accounts sent
     */
    public async forEachISCAccount(send: (account: StdAccountListOutput) => void): Promise<number> {
        const shouldFilter = this.deleteEmpty
        let count = 0

        for (const account of this.fusionAccountMap.values()) {
            if (shouldFilter && account.isOrphan()) continue
            const output = await this.getISCAccount(account, false)
            if (output) {
                send(output)
                count++
            }
        }
        for (const identity of this.fusionIdentityMap.values()) {
            if (shouldFilter && identity.isOrphan()) continue
            const output = await this.getISCAccount(identity, false)
            if (output) {
                send(output)
                count++
            }
        }
        return count
    }

    /**
     * Converts a fusion account to the ISC account output format.
     * Resolves all pending operations (correlations, reviews) before building the output,
     * then syncs collection attributes and applies the schema subset filter.
     *
     * Key / nativeIdentity handling:
     * - For existing accounts that already have a key (set during creation), the key is
     *   reused as-is. The nativeIdentity is never changed after creation to prevent
     *   disconnection between the existing Fusion account and the platform.
     * - For interim accounts (from processIdentity or processFusionIdentityDecision),
     *   the key is generated here via {@link AttributeService.getSimpleKey}.
     * - When `skipAccountsWithMissingId` is enabled and the fusion identity attribute is empty,
     *   getSimpleKey returns a provisional key whose id starts with `missing:`; the account is
     *   included in output with status `missing-id` so it appears in custom:report's unmatched bucket.
     *
     * @param fusionAccount - The fusion account to convert
     * @returns The formatted account output for the platform, or undefined if key cannot be generated
     */
    public async getISCAccount(
        fusionAccount: FusionAccount,
        awaitCorrelations = true
    ): Promise<StdAccountListOutput | undefined> {
        await fusionAccount.resolvePendingOperations(awaitCorrelations)
        // Update correlation status/action based on whatever correlations have resolved so far
        fusionAccount.updateCorrelationStatus()
        // Sync collection state (reviews, accounts, statuses, actions) into the attribute bag
        // so that the subset and output include current values (e.g. reviewer review URLs).
        fusionAccount.syncCollectionAttributesToBag()

        // Generate and assign key for interim accounts (key postponed from processIdentity/processFusionIdentityDecision)
        let key = fusionAccount.key
        if (!key) {
            key = this.attributes.getSimpleKey(fusionAccount)
            if (!key) {
                return undefined
            }
            fusionAccount.setKey(key)
        }

        const keySimpleId = key.simple?.id ?? ''
        if (keySimpleId.startsWith(FUSION_MISSING_ID_KEY_PREFIX)) {
            fusionAccount.addStatus(
                'missing-id',
                'Provisional account key: fusion identity attribute is empty (skip accounts with missing identifier is enabled).'
            )
        }

        const attributes = this.schemas.getFusionAttributeSubset(fusionAccount.attributes)
        const disabled = fusionAccount.disabled
        attributes.sources = attrConcat(Array.from(fusionAccount.sources))
        attributes.accounts = Array.from(fusionAccount.accountIds)
        attributes.history = fusionAccount.history
        attributes['missing-accounts'] = Array.from(fusionAccount.missingAccountIds)
        attributes.reviews = Array.from(fusionAccount.reviews)
        attributes.statuses = Array.from(fusionAccount.statuses)
        attributes.actions = Array.from(fusionAccount.actions)
        if (fusionAccount.originSource) {
            attributes.originSource = fusionAccount.originSource
        }
        if (fusionAccount.originAccountId) {
            attributes.originAccount = fusionAccount.originAccountId
        }

        return {
            key,
            attributes,
            disabled,
        }
    }

    // ------------------------------------------------------------------------
    // Private Helper Methods
    // ------------------------------------------------------------------------

    /**
     * Queue a low-priority disable operation for a managed account.
     * Used by the orphan source type when disableNonMatchingAccounts is enabled.
     */
    private queueDisableOperation(account: Account): void {
        const op = this.fireDisableOperation(account)
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error)
                this.log.warn(
                    `Disable operation failed for account ${account.name} [${account.sourceName}]: ${message}`
                )
            })
            .finally(() => {
                this.pendingDisableOperations.delete(op)
            })
        this.pendingDisableOperations.add(op)
    }

    private async finalizeAuthoritativeUnmatched(fusionAccount: FusionAccount): Promise<FusionAccount> {
        fusionAccount.setUnmatched()
        await this.applyPerSourceCorrelationIfNeeded(fusionAccount)
        this.setFusionAccount(fusionAccount)
        this.registerCurrentRunUnmatchedCandidate(fusionAccount)
        return fusionAccount
    }

    private registerCurrentRunUnmatchedCandidate(fusionAccount: FusionAccount): void {
        const nativeIdentity = fusionAccount.nativeIdentity
        if (!nativeIdentity) return
        this.fusionAccountMap.set(nativeIdentity, fusionAccount)
        this.currentRunUnmatchedFusionNativeIdentities.add(nativeIdentity)
    }

    /**
     * Execute a low-priority disable operation for a managed account.
     * Used by the orphan source type when disableNonMatchingAccounts is enabled.
     */
    private async fireDisableOperation(account: Account): Promise<void> {
        const accountId = account.id
        if (!accountId) {
            this.log.warn(`Cannot disable account without ID: ${account.name} [${account.sourceName}]`)
            return
        }
        if (account.disabled) {
            return
        }
        this.log.info(`Firing low-priority disable for account: ${account.name} [${account.sourceName}] (${accountId})`)
        await this.sources.fireDisableAccount(accountId)
    }

    /**
     * Prune deleted managed-account references only when we have an account-complete view:
     * - StdAccountList: full managed-source inventory
     * - Single-account rebuild commands: targeted inventory for the account being rebuilt
     */
    private shouldPruneDeletedManagedAccounts(): boolean {
        return (
            this.commandType === StandardCommand.StdAccountList ||
            this.commandType === StandardCommand.StdAccountRead ||
            this.commandType === StandardCommand.StdAccountUpdate ||
            this.commandType === StandardCommand.StdAccountEnable ||
            this.commandType === StandardCommand.StdAccountDisable
        )
    }

    /**
     * Flag candidate identities with the 'candidate' status.
     * Called when a fusion form is created to mark matching identities as candidates
     * of a pending Fusion review. The authoritative candidate set is maintained by
     * forms.pendingCandidateIdentityIds; this method provides an early status hint
     * that reconcilePendingFormState will later clear and re-apply from the canonical set.
     */
    private flagCandidatesWithStatus(fusionAccount: FusionAccount): void {
        for (const match of fusionAccount.fusionMatches) {
            const identityId = match.identityId
            if (!identityId) continue
            const identity = this.fusionIdentityMap.get(identityId)
            if (identity) {
                identity.addStatus('candidate')
                this.log.debug(`Flagged identity ${identityId} as candidate for ${fusionAccount.name}`)
            }
        }
    }

    /**
     * Set a reviewer for a specific source.
     *
     * @param fusionAccount - The fusion account to set as reviewer
     * @param sourceId - The source ID to associate the reviewer with
     */
    private setReviewerForSource(fusionAccount: FusionAccount, sourceId: string): void {
        this.log.debug(`Setting reviewer for ${fusionAccount.name} -> sourceId=${sourceId}`)
        fusionAccount.setSourceReviewer(sourceId)
        const reviewers: Set<FusionAccount> = this.reviewersBySourceId.get(sourceId) ?? new Set()
        reviewers.add(fusionAccount)
        this.reviewersBySourceId.set(sourceId, reviewers)
    }

    /**
     * Populate a reviewer's fusion reviews from pending (unanswered) form instances.
     * Clears existing reviews so only current-run pending URLs are included.
     */
    private populateReviewerFusionReviewsFromPending(reviewer: FusionAccount): void {
        reviewer.clearFusionReviews()
        const identityId = reviewer.identityId
        if (!identityId) return
        const urls = this.forms.pendingReviewUrlsByReviewerId.get(identityId)
        if (!urls?.length) return
        for (const url of urls) {
            reviewer.addFusionReview(url)
        }
    }

    /**
     * Pre-process a managed account before processing or analysis.
     *
     * @param account - The managed source account to pre-process
     * @returns FusionAccount with basic attributes mapped and non-unique attributes refreshed
     */
    private async preProcessManagedAccount(account: Account): Promise<FusionAccount> {
        const fusionAccount = FusionAccount.fromManagedAccount(account)
        this.log.debug(`Pre-processing managed account: ${account.name} [${account.sourceName}]`)

        this.attributes.mapAttributes(fusionAccount)
        await this.attributes.refreshNormalAttributes(fusionAccount)

        return fusionAccount
    }

    /**
     * Returns an iterable over fusion identity accounts.
     * Avoids creating a temporary array when only iteration is needed (e.g. scoring).
     */
    public get fusionIdentities(): Iterable<FusionAccount> {
        return this.fusionIdentityMap.values()
    }

    public get currentRunUnmatchedCandidates(): Iterable<FusionAccount> {
        return compact(
            Array.from(this.currentRunUnmatchedFusionNativeIdentities, (nativeIdentity) =>
                this.fusionAccountMap.get(nativeIdentity)
            )
        )
    }

    /**
     * Get all fusion accounts keyed by native identity as an array.
     * Note: Creates a new array on each access.
     */
    public get fusionAccounts(): FusionAccount[] {
        return mapValuesToArray(this.fusionAccountMap)
    }

    /** Total number of fusion accounts (correlated identities + uncorrelated accounts) */
    public get totalFusionAccountCount(): number {
        return this.fusionIdentityMap.size + this.fusionAccountMap.size
    }

    /**
     * Get reviewers by source ID map
     */
    public get reviewersBySourceId(): Map<string, Set<FusionAccount>> {
        return this._reviewersBySourceId
    }

    /**
     * Records conflicting correlated Fusion accounts and logs warning guidance.
     */
    private trackConflictingFusionIdentity(
        identityId: string,
        existingAccount: FusionAccount,
        newAccount: FusionAccount
    ): void {
        let accounts = this.conflictingFusionIdentityAccounts.get(identityId)
        if (!accounts) {
            accounts = new Map()
            this.conflictingFusionIdentityAccounts.set(identityId, accounts)
        }

        const existingKey = getFusionIdentityConflictTrackingKey(existingAccount)
        const newKey = getFusionIdentityConflictTrackingKey(newAccount)
        accounts.set(existingKey, existingAccount.name || existingAccount.displayName || existingKey)
        accounts.set(newKey, newAccount.name || newAccount.displayName || newKey)

        const accountLabels = Array.from(accounts.entries()).map(([nativeIdentity, name]) => `${name} (${nativeIdentity})`)
        this.log.warn(
            `More than one Fusion account was found for identity ${identityId} (${accounts.size} account(s)): ${accountLabels.join(', ')}. ` +
            'This is generally caused by non-unique account names. Please review the configuration and consider using a unique attribute for the account name.'
        )
    }

    /**
     * Set a fusion account, automatically determining whether to add it as a fusion account
     * or fusion identity based on whether it has an identityId and is not uncorrelated.
     *
     * - If the account has an identityId and is not uncorrelated → added to fusionIdentityMap (keyed by identityId)
     * - Otherwise → added to fusionAccountMap (keyed by nativeIdentity)
     *
     * This matches the logic in preProcessFusionAccount where uncorrelated accounts go to
     * fusionAccountMap and correlated accounts go to fusionIdentityMap.
     */
    public setFusionAccount(fusionAccount: FusionAccount): void {
        const identityId = fusionAccount.identityId
        const hasIdentityId = identityId && identityId.trim() !== ''
        const isUncorrelated = fusionAccount.uncorrelated

        if (hasIdentityId && !isUncorrelated) {
            const existingFusionAccount = this.fusionIdentityMap.get(identityId!)
            const existingKey = existingFusionAccount
                ? getFusionIdentityConflictTrackingKey(existingFusionAccount)
                : undefined
            const incomingKey = getFusionIdentityConflictTrackingKey(fusionAccount)
            if (existingFusionAccount && existingKey !== incomingKey) {
                this.trackConflictingFusionIdentity(identityId!, existingFusionAccount, fusionAccount)
            }
            // Add to fusion identity map, keyed by identityId (correlated account)
            // identityId is guaranteed to be a string here due to hasIdentityId check
            this.fusionIdentityMap.set(identityId!, fusionAccount)
        } else {
            // Add to fusion account map, keyed by nativeIdentity (uncorrelated account)
            // This indicates a non-identity fusion account (no identityId)
            assert(
                fusionAccount.nativeIdentity,
                'Fusion account must have a nativeIdentity to be added to fusion account map'
            )
            this.fusionAccountMap.set(fusionAccount.nativeIdentity, fusionAccount)
        }
    }

    /**
     * Retrieves a fusion account by its native identity (unique key).
     *
     * @param nativeIdentity - The native identity string to look up
     * @returns The fusion account, or undefined if not found
     */
    public getFusionAccountByNativeIdentity(nativeIdentity: string): FusionAccount | undefined {
        return this.fusionAccountMap.get(nativeIdentity)
    }

    /**
     * Generate a fusion report with all accounts that have potential matches.
     *
     * Memory Optimization:
     * After generating the report, this method clears the analyzedNonMatchReportData
     * and potentialMatchAccounts arrays to free memory. These arrays hold
     * references to all managed accounts that were analyzed during processManagedAccounts,
     * which could be thousands of objects. Clearing them as soon as the report is
     * generated significantly reduces memory footprint.
     *
     * @param includeNonMatches - Whether to include non-matching accounts in the report
     * @param stats - Optional processing statistics to include in the report
     * @returns Complete fusion report with match/non-match accounts
     */
    public generateReport(includeNonMatches: boolean = false, stats?: FusionReportStats): FusionReport {
        const accounts: FusionReportAccount[] = []
        const warnings = buildIdentityConflictWarningsFromMap(this.conflictingFusionIdentityAccounts)

        // Report on the managed accounts that were flagged as potential matches (forms created)
        for (const fusionAccount of this.potentialMatchAccounts) {
            const fusionMatches = fusionAccount.fusionMatches
            if (fusionMatches && fusionMatches.length > 0) {
                const matches = fusionMatches.map((match) => ({
                    identityName: match.identityName,
                    identityId: match.identityId,
                    identityUrl: this.urlContext.identity(match.identityId),
                    isMatch: true,
                    candidateType: match.candidateType,
                    scores: match.scores.map((score) => ({
                        attribute: score.attribute,
                        algorithm: score.algorithm,
                        score: parseFloat(score.score.toFixed(2)),
                        fusionScore: score.fusionScore,
                        isMatch: score.isMatch,
                        comment: score.comment,
                    })),
                }))
                // Release fusionIdentity refs after extracting report data (on-demand report path)
                fusionAccount.clearFusionIdentityReferences()

                const sourceInfo = this.sourcesByName.get(fusionAccount.sourceName)
                accounts.push({
                    ...buildMinimalFusionReportAccount(
                        fusionAccount,
                        this.urlContext,
                        sourceInfo?.sourceType,
                        this.reportAttributes
                    ),
                    matches,
                })
            }
        }

        // Include failed matchings (excessive candidates or runtime errors)
        const failedAccounts = [...this.failedMatchingAccounts]
        failedAccounts.sort((a, b) => a.accountName.localeCompare(b.accountName))

        const deferredAccounts = [...this.deferredMatchReportData]
        deferredAccounts.sort((a, b) => a.accountName.localeCompare(b.accountName))
        for (const deferredAccount of deferredAccounts) {
            deferredAccount.deferred = true
        }

        // Include non-matches if requested
        const nonMatchAccounts: FusionReportAccount[] = includeNonMatches ? this.generateNonMatchAccounts() : []

        // Sort matches alphabetically by account name
        accounts.sort((a, b) => a.accountName.localeCompare(b.accountName))

        // Combine: identity-backed matches, deferred matches, failed matchings, then non-matches
        const allAccounts = [...accounts, ...deferredAccounts, ...failedAccounts, ...nonMatchAccounts]

        const potentialMatches = accounts.length + deferredAccounts.length

        const report: FusionReport = {
            accounts: allAccounts,
            totalAccounts: this.newManagedAccountsCount,
            potentialMatches,
            reportDate: new Date(),
            stats,
            warnings,
        }

        // Release memory from analyzed accounts after report generation
        this.log.debug('Clearing analyzed managed accounts from memory')
        this.analyzedNonMatchReportData = []
        this.potentialMatchAccounts = []
        this.deferredMatchReportData = []
        this.failedMatchingAccounts = []
        this.conflictingFusionIdentityAccounts = new Map()

        return report
    }

    /**
     * Generate non-match accounts for reporting.
     * Uses pre-built minimal report entries; no filtering needed.
     */
    private generateNonMatchAccounts(): FusionReportAccount[] {
        const nonMatchAccounts = [...this.analyzedNonMatchReportData]
        nonMatchAccounts.sort((a, b) => a.accountName.localeCompare(b.accountName))
        return nonMatchAccounts
    }

    private hasIdentityBackedMatches(fusionAccount: FusionAccount): boolean {
        return fusionAccount.fusionMatches.some((match) => (match.candidateType ?? 'identity') === 'identity')
    }

    private hasDeferredUnmatchedMatches(fusionAccount: FusionAccount): boolean {
        return fusionAccount.fusionMatches.some((match) => match.candidateType === 'new-unmatched')
    }

}
