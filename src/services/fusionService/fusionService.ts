import { Account, IdentityDocument } from 'sailpoint-api-client'
import { StdAccountListOutput, StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceType } from '../../model/config'
import { LogService, PhaseTimer } from '../logService'
import { FormService } from '../formService'
import { FUSION_MAX_CANDIDATES_FOR_FORM_DEFAULT } from '../formService/constants'
import { IdentityService } from '../identityService'
import { SourceInfo, SourceService, buildSourceConfigPatch } from '../sourceService'
import { FusionAccount } from '../../model/account'
import { attrConcat, AttributeService } from '../attributeService'
import { assert } from '../../utils/assert'
import { createUrlContext, UrlContext } from '../../utils/url'
import { mapValuesToArray, forEachBatched, promiseAllBatched, compact, yieldToEventLoop } from './collections'
import { FusionDecision } from '../../model/form'
import { FusionMatch, MatchCandidateType, ScoringService } from '../scoringService'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { SchemaService } from '../schemaService'
import { FusionReport, FusionReportAccount, FusionReportStats } from './types'
import {
    buildIdentityConflictWarningsFromMap,
    buildMinimalFusionReportAccount,
    fusionReportMatchCandidateAccountFields,
    getFusionIdentityConflictTrackingKey,
    mapScoreReportsForFusionReport,
} from './fusionReportHelpers'
import { AttributeOperations } from '../attributeService/types'
import { buildManagedAccountKey, getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { readString } from '../../utils/safeRead'

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
    // Managed accounts with matches (forms created for review)
    private matchAccounts: FusionAccount[] = []
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
    /** Cached set of configured source names — built once in the constructor (config is immutable). */
    private readonly configSourceNames: Set<string>
    public readonly fusionOwnerIsGlobalReviewer: boolean
    public readonly fusionReportOnAggregation: boolean
    public newManagedAccountsCount: number = 0
    public identitiesProcessedCount: number = 0
    private readonly managedAccountsBatchSize: number
    public readonly commandType?: StandardCommand
    /** Connector operation name (e.g. `custom:dryrun`) — used when SDK commandType alone is ambiguous. */
    private readonly operationContext?: string
    private readonly currentRunUnmatchedFusionNativeIdentities: Set<string> = new Set()
    /**
     * Identity IDs that were auto-assigned via exact match in the current `processManagedAccounts` run.
     * Used to skip already-claimed identities during subsequent managed account scoring when
     * `fusionMergingExactMatch` is enabled, preventing duplicate assignments or spurious form creation.
     */
    private readonly autoAssignedIdentityIds: Set<string> = new Set()
    /** Per analyzed managed-account fusion object: how many identity comparisons ran (for report rows). */
    private readonly fusionIdentityComparisonsByAccount = new WeakMap<FusionAccount, number>()
    /** Accumulates Match scoring duration within a single managed-account analysis pass. */
    private currentRunMatchScoringMs = 0

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
     * @param operationContext - Handler operation name from the connector (e.g. `custom:dryrun`)
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
        commandType?: StandardCommand,
        operationContext?: string
    ) {
        FusionAccount.configure(config)
        this.configSourceNames = new Set(config.sources.map((s) => s.name))
        this.reset = config.reset
        this.fusionOwnerIsGlobalReviewer = config.fusionOwnerIsGlobalReviewer ?? false
        this.fusionReportOnAggregation = config.fusionReportOnAggregation ?? false
        this.reportAttributes = config.fusionFormAttributes ?? []
        this.urlContext = createUrlContext(config.baseurl)
        this.commandType = commandType
        this.operationContext = operationContext
        this.deleteEmpty = config.deleteEmpty
        this.managedAccountsBatchSize = config.managedAccountsBatchSize ?? 50
    }

    /**
     * Fusion/identity phases use Promise.all batches; each task runs a large synchronous preamble
     * before its first await. Capping concurrency avoids stacking tens of accounts on one turn.
     */
    private fusionParallelBatchSize(): number {
        return Math.max(1, Math.min(this.managedAccountsBatchSize, 12))
    }

    /**
     * Yield at most this often while draining the managed-account queue (in addition to per-phase yields).
     * ScoringService already yields every 100 identity comparisons, so the outer loop does not need to
     * yield as frequently. 25 accounts per outer yield reduces setImmediate overhead without sacrificing
     * event-loop responsiveness for the SDK keep-alive and logger flush paths.
     */
    private managedAccountEventLoopYieldEvery(): number {
        return Math.max(1, Math.min(this.managedAccountsBatchSize, 25))
    }

    /**
     * Populate match / deferred / non-match report slices during managed-account analysis.
     * SDKs may report `commandType` as account list for custom commands; `custom:dryrun` must still capture slices.
     */
    private shouldCaptureManagedAccountReportData(): boolean {
        return (
            this.fusionReportOnAggregation ||
            this.commandType !== StandardCommand.StdAccountList ||
            this.operationContext === 'custom:dryrun'
        )
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
        const { fusionSourceId } = this.sources
        const requestParameters = buildSourceConfigPatch(fusionSourceId, '/connectorAttributes/reset', false)
        await this.sources.patchSourceConfig(fusionSourceId, requestParameters, 'FusionService>disableReset')
    }

    /** Clears the persisted fusion state in the source configuration. */
    public async resetState(): Promise<void> {
        const { fusionSourceId } = this.sources
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
        const { fusionAccounts } = this.sources
        const startedAt = Date.now()
        this.log.info(`Pre-processing ${fusionAccounts.length} fusion account(s)`)
        const results: FusionAccount[] = []
        await forEachBatched(fusionAccounts, async (x: Account) => {
            const fusionAccount = FusionAccount.fromFusionAccount(x)
            this.setFusionAccount(fusionAccount)
            results.push(fusionAccount)
        })
        this.log.info(
            `Pre-processing fusion accounts completed: ${results.length} account(s) in ${PhaseTimer.formatElapsed(
                Date.now() - startedAt
            )}`
        )
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
        const { fusionAccounts } = this.sources
        const startedAt = Date.now()
        this.log.info(`Processing ${fusionAccounts.length} fusion account(s)`)
        const results = await promiseAllBatched(
            fusionAccounts,
            async (x: Account) => {
                return await this.processFusionAccount(x)
            },
            this.fusionParallelBatchSize()
        )
        this.log.info(
            `Fusion accounts processing completed: ${results.length} account(s) in ${PhaseTimer.formatElapsed(
                Date.now() - startedAt
            )}`
        )
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
        const { pendingReviewUrlsByReviewerId } = this.forms

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
        const batchSize = this.managedAccountsBatchSize
        const allAccounts = [...this.fusionAccounts, ...this.fusionIdentities]
        const total = allAccounts.length
        const totalBatches = total === 0 ? 0 : Math.ceil(total / batchSize)
        const logEveryBatch = totalBatches <= 25 ? 1 : Math.ceil(totalBatches / 20)
        const startedAt = Date.now()
        this.log.info(
            `Refreshing unique attributes for ${total} fusion account(s) and identity account(s) (batch size ${batchSize})`
        )
        let batchIndex = 0
        while (allAccounts.length > 0) {
            batchIndex += 1
            const batch = allAccounts.splice(0, batchSize)
            const batchStarted = Date.now()
            await Promise.all(batch.map((account) => this.attributes.refreshUniqueAttributes(account)))
            const done = total - allAccounts.length
            if (batchIndex === 1 || batchIndex % logEveryBatch === 0 || allAccounts.length === 0) {
                this.log.info(
                    `Unique attributes: ${done}/${total} account(s) processed — batch ${batchIndex}/${totalBatches} ` +
                        `(${PhaseTimer.formatElapsed(Date.now() - batchStarted)} this batch, ${PhaseTimer.formatElapsed(
                            Date.now() - startedAt
                        )} elapsed)`
                )
            }
        }
        this.log.info(
            `Unique attribute refresh completed: ${total} account(s) in ${PhaseTimer.formatElapsed(Date.now() - startedAt)}`
        )
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

        let authorizedLinkDecision: FusionDecision | undefined
        // Apply the identity layer whenever the fusion account references an identity and we have
        // that document in scope. Platform `uncorrelated` on the fusion Account means pending
        // managed-account correlation work, not "ignore the identity" — skipping the layer left
        // stale account.name (e.g. managed native id) as the hosting label and broke identity-
        // backed display attributes when originSource/baseline implied identity origin.
        if (account.identityId) {
            const identityId = account.identityId
            const identity = this.identities.getIdentityById(identityId)
            if (identity) {
                fusionAccount.addIdentityLayer(identity)
            }

            authorizedLinkDecision = this.forms.getFusionAssignmentDecision(identityId)
            if (authorizedLinkDecision) {
                fusionAccount.addFusionDecisionLayer(authorizedLinkDecision)
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
                `${fusionAccount.accountIdsSet.size} account(s), ${fusionAccount.missingAccountIdsSet.size} missing`
        )

        await yieldToEventLoop()

        if (!resetDefinition) {
            await this.attributes.registerUniqueAttributes(fusionAccount)
        }

        fusionAccount.setNeedsRefresh(fusionAccount.needsRefresh || refreshDefinition || refreshMapping)
        fusionAccount.setNeedsReset(resetDefinition)

        this.attributes.mapAttributes(fusionAccount)
        await this.attributes.refreshNormalAttributes(fusionAccount)

        // Per-source correlation for missing accounts during aggregation
        await this.applyPerSourceCorrelationIfNeeded(fusionAccount, authorizedLinkDecision)

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

        // Explicitly deplete the identity work queue so processIdentities skips
        // this identity without relying solely on the fusionIdentityMap.has() guard.
        // Mirrors how addManagedAccountLayer removes from managedAccountsById.
        const claimedIdentityId = fusionAccount.identityId
        if (claimedIdentityId) {
            this.identities.deleteIdentity(claimedIdentityId)
        }

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
     * `authorizedLinkDecision` (link-to-existing form outcome): when managed-account metadata is
     * missing for the assigned account id, `decision.account.sourceName` supplies the source for
     * the correlate check so aggregation still PATCHes when that source is `correlationMode: correlate`.
     * All other missing rows still follow `getManagedAccountInfo` + per-source mode only.
     */
    private async correlatePerSource(
        fusionAccount: FusionAccount,
        authorizedLinkDecision?: FusionDecision,
        forceDirectCorrelation: boolean = false
    ): Promise<void> {
        const missingIds = fusionAccount.missingAccountIds
        const validatedReverseSources = new Set<string>()
        const canDirectCorrelate = Boolean(fusionAccount.identityId)

        const directCorrelateIds: string[] = []
        const bySource = new Map<string, string[]>()

        for (const accountId of missingIds) {
            const info = fusionAccount.getManagedAccountInfo(accountId)
            if (!info) {
                this.log.debug(
                    `Skipping per-source correlation for missing managed key "${accountId}" on ${fusionAccount.name}: source context not available`
                )
                continue
            }

            const sourceConfig = this.sources.getSourceConfig(info.source.name)
            const mode = sourceConfig?.correlationMode ?? 'none'

            if (mode === 'correlate') {
                if (canDirectCorrelate) {
                    directCorrelateIds.push(accountId)
                }
            } else if (mode === 'reverse') {
                let ids = bySource.get(info.source.name)
                if (!ids) {
                    ids = []
                    bySource.set(info.source.name, ids)
                }
                ids.push(accountId)
            }
            // mode === 'none': skip
        }

        if (authorizedLinkDecision && !authorizedLinkDecision.newIdentity && canDirectCorrelate) {
            const assignedKey = authorizedLinkDecision.account.id
            const assignedSource = authorizedLinkDecision.account.sourceName
            if (
                assignedKey &&
                assignedSource &&
                missingIds.includes(assignedKey) &&
                !fusionAccount.getManagedAccountInfo(assignedKey) &&
                (this.sources.getSourceConfig(assignedSource)?.correlationMode ?? 'none') === 'correlate' &&
                !directCorrelateIds.includes(assignedKey)
            ) {
                directCorrelateIds.push(assignedKey)
            }
        }

        // Direct correlation
        if (directCorrelateIds.length > 0) {
            await this.identities.correlateAccounts(fusionAccount, directCorrelateIds)
        } else if (forceDirectCorrelation && canDirectCorrelate && missingIds.length > 0) {
            this.log.debug(
                `No per-source direct-correlation targets for ${fusionAccount.name}; forcing direct correlation for ${missingIds.length} missing account(s) due to explicit correlated action`
            )
            await this.identities.correlateAccounts(fusionAccount, [...missingIds])
        }

        // Reverse correlation: set attribute to first missing account nativeIdentity per source
        for (const [sourceName, accountIds] of bySource) {
            const sourceConfig = this.sources.getSourceConfig(sourceName)
            if (!sourceConfig?.correlationAttribute) continue
            if (!validatedReverseSources.has(sourceName)) {
                await this.sources.assertReverseCorrelationReady(sourceConfig)
                validatedReverseSources.add(sourceName)
            }

            const firstAccountId = accountIds[0]
            const info = fusionAccount.getManagedAccountInfo(firstAccountId)
            if (info) {
                fusionAccount.setReverseCorrelationAttribute(sourceConfig.correlationAttribute, info.schema.id)
                this.log.debug(
                    `Set reverse correlation attribute "${sourceConfig.correlationAttribute}" = "${info.schema.id}" ` +
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
        authorizedLinkDecision?: FusionDecision
    ): Promise<void> {
        if (this.commandType !== StandardCommand.StdAccountList) return
        if (fusionAccount.missingAccountIdsSet.size === 0) return
        await this.correlatePerSource(fusionAccount, authorizedLinkDecision)
    }

    /**
     * Run per-source correlation for missing accounts (direct PATCH and/or reverse attributes).
     * Use when correlation must run outside account-list aggregation (e.g. correlate entitlement action).
     */
    public async correlateMissingAccountsPerSource(fusionAccount: FusionAccount): Promise<void> {
        if (fusionAccount.missingAccountIdsSet.size === 0) return
        await this.correlatePerSource(fusionAccount, undefined, true)
        fusionAccount.updateCorrelationStatus()
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
        const startedAt = Date.now()
        this.log.info(`Processing ${identities.length} identities`)
        const results = await promiseAllBatched(
            identities,
            (x) => this.processIdentity(x),
            this.fusionParallelBatchSize()
        )
        const { managedSources } = this.sources
        managedSources.forEach((source) => {
            this.sourcesByName.set(source.name, source)
        })

        if (this.fusionOwnerIsGlobalReviewer) {
            const globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
            for (const reviewerId of globalOwnerIds) {
                const reviewer = this.fusionIdentityMap.get(reviewerId)
                if (reviewer) {
                    managedSources.forEach((source) => {
                        this.setReviewerForSource(reviewer, source.id!)
                    })
                    this.populateReviewerFusionReviewsFromPending(reviewer)
                }
            }
        }
        this.log.info(
            `Identities processing completed: ${identities.length} identity document(s) in ${PhaseTimer.formatElapsed(
                Date.now() - startedAt
            )}`
        )
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
                this.log.debug(
                    `Re-registered existing Fusion account under new identity: ${identity.name} (${identityId})`
                )
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

            // Keep fusion display aligned with identity label precedence.
            const identityDisplayName =
                String((identity.attributes as Record<string, unknown> | undefined)?.displayName ?? '').trim() ||
                identity.name
            fusionAccount.attributes[fusionDisplayAttribute] = identityDisplayName

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
        const sourceNames = this.configSourceNames
        const identityAccountIds = new Set<string>(
            (identity.accounts ?? [])
                .filter((a) => sourceNames.has(a.source?.name ?? ''))
                .map((a) =>
                    buildManagedAccountKey({
                        sourceId: a.source?.id,
                        nativeIdentity: readString(a, 'nativeIdentity'),
                    })
                )
                .filter((value): value is string => Boolean(value))
        )
        if (identityAccountIds.size === 0) return undefined

        // Check uncorrelated accounts first
        for (const account of this.fusionAccountMap.values()) {
            let found = false
            for (const id of account.accountIds) {
                if (identityAccountIds.has(id)) {
                    found = true
                    break
                }
            }
            if (!found) {
                for (const id of account.missingAccountIds) {
                    if (identityAccountIds.has(id)) {
                        found = true
                        break
                    }
                }
            }
            if (found) return account
        }

        // Check for accounts from stale identity IDs (identity was destroyed and recreated)
        for (const [existingIdentityId, account] of this.fusionIdentityMap.entries()) {
            if (existingIdentityId === identity.id) continue
            let found = false
            for (const id of account.accountIds) {
                if (identityAccountIds.has(id)) {
                    found = true
                    break
                }
            }
            if (!found) {
                for (const id of account.missingAccountIds) {
                    if (identityAccountIds.has(id)) {
                        found = true
                        break
                    }
                }
            }
            if (found) return account
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
        const startedAt = Date.now()
        this.log.info(`Processing ${fusionIdentityDecisions.length} fusion identity decision(s)`)

        const results = await promiseAllBatched(fusionIdentityDecisions, (x) => this.processFusionIdentityDecision(x))
        this.log.info(
            `Fusion identity decisions processing completed: ${fusionIdentityDecisions.length} decision(s) in ${PhaseTimer.formatElapsed(
                Date.now() - startedAt
            )}`
        )
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
        const sourceType = fusionDecision.sourceType ?? SourceType.Authoritative
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
                    // Only make live API calls during real aggregation; customReport is read-only analysis.
                    const identity =
                        this.commandType === StandardCommand.StdAccountList
                            ? (cached ?? (await this.identities.fetchIdentityById(submitterId)))
                            : cached
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
                // Only make live API calls during real aggregation; customReport is read-only analysis.
                const identity =
                    this.commandType === StandardCommand.StdAccountList
                        ? (cached ?? (await this.identities.fetchIdentityById(fusionDecision.identityId)))
                        : cached
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

        // For authorized decisions (including synthetic perfect-match automatic assignment),
        // hydrate the selected identity so per-source direct correlation can execute now.
        if (isAuthorizedDecision && fusionDecision.identityId) {
            if (!selectedIdentity) {
                try {
                    const cachedForDecision = this.identities.getIdentityById(fusionDecision.identityId)
                    // Only make live API calls during real aggregation; customReport is read-only analysis.
                    selectedIdentity =
                        this.commandType === StandardCommand.StdAccountList
                            ? (cachedForDecision ??
                              (await this.identities.fetchIdentityById(fusionDecision.identityId)))
                            : cachedForDecision
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
            await this.applyPerSourceCorrelationIfNeeded(fusionAccount, fusionDecision)
            fusionAccount.updateCorrelationStatus()
            this.setFusionAccount(fusionAccount)
        }

        if (fusionDecision.newIdentity) {
            if (sourceType === SourceType.Record) {
                this.log.debug(
                    `Record no-match decision for ${fusionDecision.account.name}, registering unique attributes only`
                )
                await this.attributes.registerUniqueAttributes(fusionAccount)
                return undefined
            }
            if (sourceType === SourceType.Orphan) {
                this.log.debug(`Orphan no-match decision for ${fusionDecision.account.name}, dropping`)
                const sourceInfo = this.sourcesByName.get(fusionDecision.account.sourceName)
                if (sourceInfo?.config?.disableNonMatchingAccounts) {
                    const decisionManagedKey = String(fusionDecision.account.id ?? '').trim()
                    const managedAccount = decisionManagedKey
                        ? this.sources.managedAccountsById.get(decisionManagedKey)
                        : undefined
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
                    `[${fusionDecision.account.sourceName}] (key ${fusionDecision.account.id})`
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
        const processManagedAccountsStartedAt = Date.now()
        this.newManagedAccountsCount = map.size
        this.currentRunUnmatchedFusionNativeIdentities.clear()
        this.autoAssignedIdentityIds.clear()

        this._sourcesWithoutReviewers = new Set()
        for (const source of this.sources.managedSources) {
            const reviewers = this._reviewersBySourceId.get(source.id)
            if (!reviewers || reviewers.size === 0) {
                this._sourcesWithoutReviewers.add(source.name)
                this.log.error(
                    `No valid reviewer configured for source "${source.name}". ` +
                        `Managed accounts from this source will be treated as NonMatched.`
                )
            }
        }

        this.currentRunMatchScoringMs = 0
        const initialQueueSize = map.size
        this.log.info(`Processing ${initialQueueSize} managed account(s)`)
        let processed = 0
        const yieldEveryManaged = this.managedAccountEventLoopYieldEvery()
        const logProgressEvery = Math.max(1, Math.min(50, Math.ceil(initialQueueSize / 20) || 1))
        for (const account of map.values()) {
            await this.processManagedAccount(account)
            processed += 1
            if (processed === 1 || processed % logProgressEvery === 0 || processed === initialQueueSize) {
                this.log.info(
                    `Managed accounts: ${processed}/${initialQueueSize} processed (${PhaseTimer.formatElapsed(
                        Date.now() - processManagedAccountsStartedAt
                    )} elapsed)`
                )
            }
            if (processed % yieldEveryManaged === 0) {
                await yieldToEventLoop()
            }
        }
        const totalElapsed = Date.now() - processManagedAccountsStartedAt
        this.log.info(
            `Managed accounts processing completed: ${processed} account(s) in ${PhaseTimer.formatElapsed(
                totalElapsed
            )} (Match scoring: ${PhaseTimer.formatElapsed(this.currentRunMatchScoringMs)})`
        )
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
     * After scoring, the account is either assigned automatically to the matched identity
     * (perfect scores when enabled), sent for manual review (partial match), or handled
     * based on the source type:
     * - authoritative: added as unmatched new identity (output as ISC account)
     * - record: unique attributes registered but not output as ISC account
     * - orphan: dropped immediately; optionally fires a disable operation
     *
     * @param account - The uncorrelated ISC account from a managed source
     * @returns The fusion account produced or updated, or undefined if skipped or sent for manual review.
     *          Same-aggregation deferred matches (peer is another new unmatched account) are removed from
     *          the managed-account work queue for this run; they are expected to be re-fetched next aggregation.
     */
    public async processManagedAccount(account: Account): Promise<FusionAccount | undefined> {
        const sourceInfo = account.sourceName ? this.sourcesByName.get(account.sourceName) : undefined
        const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative

        if (account.sourceName && this._sourcesWithoutReviewers.has(account.sourceName)) {
            const fusionAccount = await this.preProcessManagedAccount(account)
            if (sourceType !== SourceType.Authoritative) {
                this.log.debug(
                    `Account ${account.name} [${fusionAccount.sourceName}] has no reviewers and sourceType=${sourceType}, skipping`
                )
                if (sourceType === SourceType.Record) {
                    await this.attributes.registerUniqueAttributes(fusionAccount)
                } else if (sourceType === SourceType.Orphan && sourceInfo?.config?.disableNonMatchingAccounts) {
                    this.queueDisableOperation(account)
                }
                return undefined
            }
            return await this.finalizeAuthoritativeUnmatched(fusionAccount)
        }

        const fusionAccount = await this.analyzeManagedAccount(account)
        const hasIdentityBackedMatches = this.hasIdentityBackedMatches(fusionAccount)
        const hasNewUnmatchedPeerMatches = this.hasNewUnmatchedPeerMatches(fusionAccount)

        if (hasIdentityBackedMatches) {
            const perfectMatch = fusionAccount.fusionMatches.find((m) => FusionService.hasAllAttributeScoresPerfect(m))
            const identityId = perfectMatch?.identityId
            if (this.config.fusionMergingExactMatch && identityId) {
                if (this.commandType !== StandardCommand.StdAccountList) {
                    // Analysis-only runs (e.g. custom:dryrun): keep match report data but do not
                    // register decisions or mutate fusion state as in a real aggregation.
                    this.flagCandidatesWithStatus(fusionAccount)
                    fusionAccount.clearFusionIdentityReferences()
                    return undefined
                }
                this.removeMatchAccount(fusionAccount.managedAccountId)
                this.log.debug(
                    `Account ${account.name} [${fusionAccount.sourceName}] has all scores 100, automatic assignment to identity ${identityId}`
                )
                // Prevent subsequent managed accounts from scoring against this identity
                this.autoAssignedIdentityIds.add(identityId)
                const syntheticDecision = this.createAutomaticAssignmentDecision(fusionAccount, account, identityId)
                this.forms.registerFinishedDecision(syntheticDecision)
                return await this.processFusionIdentityDecision(syntheticDecision)
            } else {
                assert(sourceInfo, 'Source info not found')
                const reviewers = this.reviewersBySourceId.get(sourceInfo.id!)
                if (this.commandType !== StandardCommand.StdAccountList) {
                    this.flagCandidatesWithStatus(fusionAccount)
                    fusionAccount.clearFusionIdentityReferences()
                    return undefined
                }
                try {
                    const formCreated = await this.forms.createFusionForm(fusionAccount, reviewers)
                    if (!formCreated) {
                        const matchCount = fusionAccount.fusionMatches.length
                        const maxForm = this.config.fusionMaxCandidatesForForm ?? FUSION_MAX_CANDIDATES_FOR_FORM_DEFAULT
                        if (!reviewers || reviewers.size === 0) {
                            this.trackFailedMatching(
                                fusionAccount,
                                'Match review form was not created: no reviewers available for this source'
                            )
                        } else {
                            this.trackFailedMatching(
                                fusionAccount,
                                `Match review form was not created (${matchCount} potential match(es); form lists up to ${maxForm} highest-scoring candidate(s))`
                            )
                        }
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    this.trackFailedMatching(fusionAccount, `Form creation failed: ${message}`)
                }
                this.flagCandidatesWithStatus(fusionAccount)
                fusionAccount.clearFusionIdentityReferences()
                return undefined
            }
        } else if (hasNewUnmatchedPeerMatches) {
            const deferredMatches = fusionAccount.fusionMatches.filter((m) => m.candidateType === 'new-unmatched')
            const { headline, summary } = FusionService.formatFusionMatchDiscoveryLog(deferredMatches, true)
            this.log.info(`${headline}: ${account.name} [${account.sourceName}] - ${summary}; skipping account for now`)
            this.removeManagedAccountFromWorkQueue(account)
            return undefined
        } else {
            // Non-match handling varies by source type
            if (sourceType === SourceType.Record) {
                await this.attributes.registerUniqueAttributes(fusionAccount)
                return undefined
            }

            if (sourceType === SourceType.Orphan) {
                if (sourceInfo?.config?.disableNonMatchingAccounts) {
                    this.queueDisableOperation(account)
                }
                return undefined
            }

            // authoritative (default)
            await this.finalizeAuthoritativeUnmatched(fusionAccount)
            const mk = getManagedAccountKeyFromAccount(account)
            this.log.debug(
                `Registered managed account as fusion account: ${account.name} [${account.sourceName}] (${mk ?? 'no-key'})`
            )
            return fusionAccount
        }
    }

    /**
     * Returns true when every configured rule was evaluated (none skipped) and scored 100.
     * Excludes synthetic combined rows (`weighted-mean` / legacy `average`).
     */
    private static hasAllAttributeScoresPerfect(match: FusionMatch): boolean {
        return isExactAttributeMatchScores(match.scores)
    }

    /**
     * Builds a synthetic fusion decision when all attribute scores are 100 (exact match),
     * skipping manual review (automatic assignment to the selected identity).
     *
     * @param fusionAccount - The fusion account being assigned
     * @param account - The managed account
     * @param identityId - The target identity ID
     * @returns Synthetic FusionDecision for automatic assignment
     */
    private createAutomaticAssignmentDecision(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): FusionDecision {
        const accountKey = getManagedAccountKeyFromAccount(account)
        assert(accountKey, 'Managed account missing composite key for automatic assignment decision')
        return {
            submitter: { id: 'system', email: '', name: 'System (automatic assignment)' },
            account: {
                id: accountKey,
                name: fusionAccount.name ?? account.name ?? '',
                sourceName: fusionAccount.sourceName,
                sourceId: readString(account, 'sourceId'),
                nativeIdentity: account.nativeIdentity ?? undefined,
            },
            newIdentity: false,
            identityId,
            comments: 'Automatically assigned: exact attribute match (all rules 100, none skipped)',
            finished: true,
            automaticAssignment: true,
        }
    }

    /**
     * Builds info-log headline and "- N candidate(s), M partial(s)" suffix from match scores.
     * "candidate(s)" counts exact (all rules 100, none skipped); "partial(s)" are other matches in the set.
     */
    private static formatFusionMatchDiscoveryLog(
        matches: ReadonlyArray<FusionMatch>,
        deferred: boolean
    ): { headline: string; summary: string } {
        let exact = 0
        for (const m of matches) {
            if (isExactAttributeMatchScores(m.scores)) exact++
        }
        const partial = matches.length - exact
        const segments: string[] = []
        if (exact > 0) segments.push(`${exact} candidate(s)`)
        if (partial > 0) segments.push(`${partial} partial(s)`)
        const summary = segments.length > 0 ? segments.join(', ') : '0 candidate(s)'
        if (deferred) {
            return {
                headline: exact > 0 ? 'DEFERRED EXACT MATCH FOUND' : 'DEFERRED MATCH FOUND',
                summary,
            }
        }
        return {
            headline: exact > 0 ? 'EXACT MATCH FOUND' : 'MATCH FOUND',
            summary,
        }
    }

    /**
     * Full sequential scan of every loaded managed account, returning a FusionAccount per entry.
     * Used when correlating outside the primary fusion-ISC stream (e.g. dry-run emission for
     * uncorrelated / work-queue remainder). Iterates the map directly; runs sequentially so
     * deferred-candidate visibility is preserved between managed accounts.
     *
     * @returns Array of FusionAccount with match results populated for each
     */
    public async analyzeUncorrelatedAccounts(): Promise<FusionAccount[]> {
        const map = this.sources.managedAccountsById
        assert(map, 'Managed accounts have not been loaded')
        this.currentRunMatchScoringMs = 0
        const analyzeUncorrelatedStartedAt = Date.now()
        const results: FusionAccount[] = []
        let processed = 0
        const yieldEveryManaged = this.managedAccountEventLoopYieldEvery()
        for (const account of map.values()) {
            const fusionAccount = await this.analyzeManagedAccount(account)
            if (
                fusionAccount.isMatch &&
                !this.hasIdentityBackedMatches(fusionAccount) &&
                this.hasNewUnmatchedPeerMatches(fusionAccount)
            ) {
                const deferredMatches = fusionAccount.fusionMatches.filter((m) => m.candidateType === 'new-unmatched')
                const { headline, summary } = FusionService.formatFusionMatchDiscoveryLog(deferredMatches, true)
                this.log.info(`${headline}: ${account.name} [${account.sourceName}] - ${summary}`)
            }
            results.push(fusionAccount)
            processed += 1
            if (processed % yieldEveryManaged === 0) {
                await yieldToEventLoop()
            }
        }
        const totalMs = Date.now() - analyzeUncorrelatedStartedAt
        this.log.info(
            `Performance metric: FusionService.analyzeUncorrelatedAccounts durationMs=${totalMs} analyzed=${
                results.length
            } matchScoringMs=${this.currentRunMatchScoringMs}`
        )
        return results
    }

    /**
     * Analyzes a single managed account by scoring it against all existing fusion identities.
     * Tracks the account for reporting when reporting is enabled.
     *
     * Memory: Only populates matchAccounts/analyzedNonMatchReportData when
     * fusionReportOnAggregation is true, command is not StdAccountList, or operation is `custom:dryrun`.
     * Stores minimal FusionReportAccount for non-matches when report data is needed.
     *
     * @param account - The managed source account to analyze
     * @returns The scored FusionAccount with match results populated
     */
    public async analyzeManagedAccount(account: Account): Promise<FusionAccount> {
        const { name, sourceName } = account
        const fusionAccount = await this.preProcessManagedAccount(account)
        const sourceType =
            (account.sourceName ? this.sourcesByName.get(account.sourceName)?.sourceType : undefined) ??
            SourceType.Authoritative
        const recordMatchingEnabled = this.isRecordMatchingEnabledForSource(account.sourceName ?? undefined)
        let fusionIdentityComparisons = 0
        let hasIdentityBackedMatches = false
        if (recordMatchingEnabled) {
            // When exact-match auto-assignment is enabled, exclude identities already claimed in
            // this run so a second managed account cannot match against a spoken-for identity.
            const identityPool =
                this.config.fusionMergingExactMatch && this.autoAssignedIdentityIds.size > 0
                    ? this.fusionIdentitiesExcluding(this.autoAssignedIdentityIds)
                    : this.fusionIdentities
            const identityScoringStarted = Date.now()
            fusionIdentityComparisons = await this.scoring.scoreFusionAccount(
                fusionAccount,
                identityPool,
                MatchCandidateType.Identity
            )
            this.currentRunMatchScoringMs += Date.now() - identityScoringStarted
            hasIdentityBackedMatches = this.hasIdentityBackedMatches(fusionAccount)
            if (!hasIdentityBackedMatches && this.isDeferredMatchingEnabledForSource(account.sourceName ?? undefined)) {
                const deferredScoringStarted = Date.now()
                fusionIdentityComparisons += await this.scoring.scoreFusionAccount(
                    fusionAccount,
                    this.currentRunUnmatchedCandidates,
                    MatchCandidateType.NewUnmatched
                )
                this.currentRunMatchScoringMs += Date.now() - deferredScoringStarted
            }
        } else {
            this.log.debug(
                `Skipping Match scoring for record source account: ${name} [${sourceName}] ` +
                    `(includeRecordAccountsForMatching=false)`
            )
        }
        this.fusionIdentityComparisonsByAccount.set(fusionAccount, fusionIdentityComparisons)

        if (fusionAccount.isMatch) {
            if (hasIdentityBackedMatches) {
                const identityMatches = fusionAccount.fusionMatches.filter(
                    (m) => (m.candidateType ?? 'identity') === 'identity'
                )
                const { headline, summary } = FusionService.formatFusionMatchDiscoveryLog(identityMatches, false)
                this.log.info(`${headline}: ${name} [${sourceName}] - ${summary}`)
            }

            // Keep full FusionAccount for report when reporting is enabled (aggregation), on-demand analysis, or custom:dryrun
            if (this.shouldCaptureManagedAccountReportData()) {
                if (hasIdentityBackedMatches) {
                    this.matchAccounts.push(fusionAccount)
                } else {
                    const deferredMatches = fusionAccount.fusionMatches
                        .filter((match) => match.candidateType === 'new-unmatched')
                        .map((match) => {
                            const fields = fusionReportMatchCandidateAccountFields(match)
                            const fi = match.fusionIdentity
                            const peerIdentityId = fi?.identityId
                            const identityUrl =
                                (peerIdentityId ? this.urlContext.identity(peerIdentityId) : undefined) ??
                                (fi?.managedAccountId
                                    ? this.urlContext.humanAccount(fi.managedAccountId)
                                    : undefined) ??
                                (fields.accountId ? this.urlContext.humanAccount(fields.accountId) : undefined)
                            return {
                                ...fields,
                                identityName: match.identityName,
                                identityId: peerIdentityId,
                                identityUrl,
                                isMatch: true,
                                candidateType: 'new-unmatched' as const,
                                exact: isExactAttributeMatchScores(match.scores),
                                scores: mapScoreReportsForFusionReport(match.scores),
                            }
                        })
                    this.deferredMatchReportData.push({
                        ...buildMinimalFusionReportAccount(
                            fusionAccount,
                            this.urlContext,
                            this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                            this.reportAttributes
                        ),
                        deferred: true,
                        fusionIdentityComparisons,
                        matches: deferredMatches,
                    })
                }
            }
        } else {
            this.log.debug(`No match found for managed account: ${name} [${sourceName}]`)
            if (
                sourceType === SourceType.Authoritative &&
                this.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)
            ) {
                // Keep current-run authoritative non-matches available as deferred candidates
                // for subsequent managed-account analysis in custom:dryrun.
                this.registerCurrentRunUnmatchedCandidate(fusionAccount)
            }
            // Store minimal report data when reporting is enabled, on-demand analysis, or custom:dryrun
            if (this.shouldCaptureManagedAccountReportData()) {
                this.analyzedNonMatchReportData.push({
                    ...buildMinimalFusionReportAccount(
                        fusionAccount,
                        this.urlContext,
                        this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                        this.reportAttributes
                    ),
                    fusionIdentityComparisons,
                })
            }
        }

        return fusionAccount
    }

    /**
     * Same-aggregation (deferred) matching.
     *
     * Default is enabled to preserve existing behavior unless explicitly disabled
     * per-source via config.
     */
    private isDeferredMatchingEnabledForSource(sourceName: string | undefined): boolean {
        if (!sourceName) return false
        const info = this.sourcesByName.get(sourceName)
        if (!info?.config) return true
        return info.config.deferredMatching !== false
    }

    /**
     * Record sources: Match scoring (identity + optional deferred peers). Default true.
     * When false, record accounts skip scoring but still participate in Map & Define and
     * unique-attribute registration.
     */
    private isRecordMatchingEnabledForSource(sourceName: string | undefined): boolean {
        if (!sourceName) return true
        const info = this.sourcesByName.get(sourceName)
        const sourceType = info?.sourceType ?? SourceType.Authoritative
        if (sourceType !== SourceType.Record) {
            return true
        }
        return info?.config?.includeRecordAccountsForMatching !== false
    }

    /**
     * Records a failed matching for inclusion in the fusion report.
     * Called when form creation fails (excessive candidates or runtime error).
     */
    private trackFailedMatching(fusionAccount: FusionAccount, error: string): void {
        this.log.error(`Failed matching for account ${fusionAccount.name} [${fusionAccount.sourceName}]: ${error}`)
        if (this.shouldCaptureManagedAccountReportData()) {
            this.failedMatchingAccounts.push({
                ...buildMinimalFusionReportAccount(
                    fusionAccount,
                    this.urlContext,
                    this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                    this.reportAttributes,
                    error
                ),
                fusionIdentityComparisons: this.fusionIdentityComparisonsByAccount.get(fusionAccount) ?? 0,
            })
        }
    }

    /**
     * Removes an account from match reporting when the account was assigned automatically.
     * This prevents "manual review" report sections from showing resolved perfect matches.
     */
    private removeMatchAccount(managedAccountId?: string): void {
        if (!managedAccountId) return
        const idx = this.matchAccounts.findIndex((x) => x.managedAccountId === managedAccountId)
        if (idx !== -1) this.matchAccounts.splice(idx, 1)
    }

    // ------------------------------------------------------------------------
    // Public Cleanup Methods
    // ------------------------------------------------------------------------

    /**
     * Clear analyzed managed account arrays to free memory.
     *
     * Memory Optimization:
     * analyzedNonMatchReportData and matchAccounts accumulate during
     * processManagedAccounts. They are also cleared inside generateReport(), but
     * when no report is generated, these arrays would persist for the lifetime of the operation. This method
     * ensures they are always released regardless of report configuration.
     *
     * Safe to call multiple times (idempotent).
     */
    public clearAnalyzedAccounts(): void {
        if (
            this.analyzedNonMatchReportData.length > 0 ||
            this.matchAccounts.length > 0 ||
            this.deferredMatchReportData.length > 0 ||
            this.failedMatchingAccounts.length > 0 ||
            this.conflictingFusionIdentityAccounts.size > 0
        ) {
            this.log.debug('Clearing analyzed managed accounts from memory')
            this.analyzedNonMatchReportData = []
            this.matchAccounts = []
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
        const batchSize = this.fusionParallelBatchSize()
        const forEachStartedAt = Date.now()
        let count = 0
        const eligibleAccounts: FusionAccount[] = []

        for (const account of this.fusionAccountMap.values()) {
            if (shouldFilter && account.isOrphan()) continue
            eligibleAccounts.push(account)
        }
        for (const identity of this.fusionIdentityMap.values()) {
            if (shouldFilter && identity.isOrphan()) continue
            eligibleAccounts.push(identity)
        }

        for (let i = 0; i < eligibleAccounts.length; i += batchSize) {
            const batch = eligibleAccounts.slice(i, i + batchSize)
            const outputBatch = await Promise.all(batch.map((account) => this.getISCAccount(account, false)))
            for (const output of outputBatch) {
                if (output) {
                    send(output)
                    count++
                }
            }
            await yieldToEventLoop()
        }
        this.log.info(
            `Performance metric: FusionService.forEachISCAccount durationMs=${
                Date.now() - forEachStartedAt
            } eligible=${eligibleAccounts.length} sent=${count} batchSize=${batchSize}`
        )
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
     * - When `skipAccountsWithMissingId` is enabled and the identity attribute is empty,
     *   getSimpleKey returns undefined and the account is omitted from the output. This
     *   enables a deliberate pattern: generate an empty identity attribute to prevent
     *   specific managed accounts or identities from producing Fusion accounts.
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
    /**
     * Drops a managed account from the work queue for this run so deferred accounts are not
     * counted as unprocessed or touched again until the next aggregation reloads them from sources.
     */
    private removeManagedAccountFromWorkQueue(account: Account): void {
        const id = getManagedAccountKeyFromAccount(account)
        const byId = this.sources.managedAccountsById
        if (!id || !byId?.has(id)) {
            return
        }
        byId.delete(id)
        const identityId = account.identityId
        if (identityId) {
            const idSet = this.sources.managedAccountsByIdentityId.get(identityId)
            if (idSet) {
                idSet.delete(id)
                if (idSet.size === 0) {
                    this.sources.managedAccountsByIdentityId.delete(identityId)
                }
            }
        }
    }

    private queueDisableOperation(account: Account): void {
        if (this.commandType !== StandardCommand.StdAccountList) {
            return
        }
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
        fusionAccount.setNonMatched()
        await this.applyPerSourceCorrelationIfNeeded(fusionAccount)
        this.setFusionAccount(fusionAccount)
        if (this.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)) {
            this.registerCurrentRunUnmatchedCandidate(fusionAccount)
        }
        return fusionAccount
    }

    private registerCurrentRunUnmatchedCandidate(fusionAccount: FusionAccount): void {
        const { nativeIdentity } = fusionAccount
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

    /**
     * Returns an iterable over fusion identities, skipping those whose identityId is in `excludeIds`.
     * Used to filter already auto-assigned identities during managed account scoring.
     */
    private *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
        for (const identity of this.fusionIdentityMap.values()) {
            if (!identity.identityId || !excludeIds.has(identity.identityId)) {
                yield identity
            }
        }
    }

    public get currentRunUnmatchedCandidates(): Iterable<FusionAccount> {
        return this._currentRunUnmatchedCandidatesIterable()
    }

    /** Generator that yields unmatched candidates without allocating intermediate arrays. */
    private *_currentRunUnmatchedCandidatesIterable(): Iterable<FusionAccount> {
        for (const nativeIdentity of this.currentRunUnmatchedFusionNativeIdentities) {
            const account = this.fusionAccountMap.get(nativeIdentity)
            if (account) yield account
        }
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

        const accountLabels = Array.from(accounts.entries()).map(
            ([nativeIdentity, name]) => `${name} (${nativeIdentity})`
        )
        this.log.warn(
            `More than one Fusion account was found for identity ${identityId} (${accounts.size} account(s)): ${accountLabels.join(', ')}. ` +
                'This is generally caused by non-unique account names. Please review the configuration and consider using a unique attribute for the account name.'
        )
    }

    /**
     * Set a fusion account, automatically determining whether to add it as a fusion account
     * or fusion identity based solely on whether it has an identityId.
     *
     * - If the account has an identityId → added to fusionIdentityMap (keyed by identityId)
     * - Otherwise → added to fusionAccountMap (keyed by nativeIdentity)
     *
     * Routing is intentionally independent of the `uncorrelated` flag. Uncorrelated managed
     * accounts (pending correlation) do not negate the identity association — keeping identity-
     * linked accounts in fusionIdentityMap is what allows processIdentities to skip them via
     * `fusionIdentityMap.has(identityId)`, preventing spurious duplicate baseline creation.
     * This is consistent with preProcessFusionAccounts, where `_uncorrelated` is never set
     * during the bare fromFusionAccount build so all accounts with identityId land here.
     */
    public setFusionAccount(fusionAccount: FusionAccount): void {
        const identityId = fusionAccount.identityId
        const hasIdentityId = identityId && identityId.trim() !== ''

        if (hasIdentityId) {
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
     * Generate a fusion report with all accounts that have matches.
     *
     * Memory Optimization:
     * After generating the report, this method clears the analyzedNonMatchReportData
     * and matchAccounts arrays to free memory. These arrays hold
     * references to all managed accounts that were analyzed during processManagedAccounts,
     * which could be thousands of objects. Clearing them as soon as the report is
     * generated significantly reduces memory footprint.
     *
     * @param includeNonMatches - When true, append per-account rows for managed non-matches (e.g. custom:dryrun). Email reports omit these.
     * @param stats - Optional processing statistics to include in the report
     * @returns Complete fusion report with match/non-match accounts
     */
    public generateReport(includeNonMatches: boolean = false, stats?: FusionReportStats): FusionReport {
        const accounts: FusionReportAccount[] = []
        const warnings = buildIdentityConflictWarningsFromMap(this.conflictingFusionIdentityAccounts)

        // Report on managed accounts with matches (forms created)
        for (const fusionAccount of this.matchAccounts) {
            const fusionMatches = fusionAccount.fusionMatches
            if (fusionMatches && fusionMatches.length > 0) {
                const matches = fusionMatches.map((match) => ({
                    ...fusionReportMatchCandidateAccountFields(match),
                    identityName: match.identityName,
                    identityId: match.identityId,
                    identityUrl: this.urlContext.identity(match.identityId),
                    isMatch: true,
                    candidateType: match.candidateType,
                    exact: isExactAttributeMatchScores(match.scores),
                    scores: mapScoreReportsForFusionReport(match.scores),
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
                    fusionIdentityComparisons: this.fusionIdentityComparisonsByAccount.get(fusionAccount) ?? 0,
                    matches,
                })
            }
        }

        // Sort in-place — these arrays are cleared just below, so no copy is needed.
        this.failedMatchingAccounts.sort((a, b) => a.accountName.localeCompare(b.accountName))

        this.deferredMatchReportData.sort((a, b) => a.accountName.localeCompare(b.accountName))
        for (const deferredAccount of this.deferredMatchReportData) {
            deferredAccount.deferred = true
        }

        // Include non-matches if requested
        const nonMatchAccounts: FusionReportAccount[] = includeNonMatches ? this.generateNonMatchAccounts() : []

        // Sort matches alphabetically by account name
        accounts.sort((a, b) => a.accountName.localeCompare(b.accountName))

        // Combine: identity-backed matches, deferred matches, failed matchings, then non-matches
        const allAccounts = [
            ...accounts,
            ...this.deferredMatchReportData,
            ...this.failedMatchingAccounts,
            ...nonMatchAccounts,
        ]

        const matchAccountCount = accounts.length + this.deferredMatchReportData.length

        const report: FusionReport = {
            accounts: allAccounts,
            totalAccounts: this.newManagedAccountsCount,
            matches: matchAccountCount,
            reportDate: new Date(),
            stats,
            warnings,
        }

        // Release memory from analyzed accounts after report generation
        this.log.debug('Clearing analyzed managed accounts from memory')
        this.analyzedNonMatchReportData = []
        this.matchAccounts = []
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

    private hasNewUnmatchedPeerMatches(fusionAccount: FusionAccount): boolean {
        return fusionAccount.fusionMatches.some((match) => match.candidateType === 'new-unmatched')
    }
}
