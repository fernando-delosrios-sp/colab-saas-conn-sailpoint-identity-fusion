import { Account, IdentityDocument } from 'sailpoint-api-client'
import { StdAccountListOutput, StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceType } from '../../model/config'
import { LogService, PhaseTimer } from '../logService'
import { FormService } from '../formService'
import { defaultFusionMaxCandidatesForForm, defaults } from '../../data/config'
import { IdentityService } from '../identityService'
import { SourceInfo, SourceService } from '../sourceService'
import { FusionAccount } from '../../model/account'
import { attrConcat, AttributeService } from '../attributeService'
import { assert } from '../../utils/assert'
import { createUrlContext, UrlContext } from '../../utils/url'
import { mapValuesToArray, forEachBatched, promiseAllBatched, compact, yieldToEventLoop, createBatchProgressLogger } from './collections'
import { FusionDecision } from '../../model/form'
import { FusionMatch, MatchCandidateType, ScoringService } from '../scoringService'
import { SchemaService } from '../schemaService'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { FusionReport, FusionReportAccount, FusionReportStats } from './types'
import { buildFusionReport } from './fusionReportBuilder'
import { processManagedAccount, hasAllAttributeScoresPerfect } from './fusionManagedAccountProcessor'
import {
    buildIdentityConflictWarningsFromMap,
    buildMinimalFusionReportAccount,
    fusionReportMatchCandidateAccountFields,
    getFusionIdentityConflictTrackingKey,
    mapScoreReportsForFusionReport,
} from './helpers'
import { AttributeOperations } from '../attributeService/types'
import {
    buildManagedAccountKey,
    getManagedAccountKeyFromAccount,
    normalizeCompositeManagedAccountKey,
} from '../../model/managedAccountKey'
import { coerceBoolean, hasValue, readString, trimStr } from '../../utils/safeRead'

// ============================================================================
// FusionService Class
// ============================================================================

type ManagedAccountAnalysisContext = {
    account: Account
    fusionAccount: FusionAccount
    sourceInfo: SourceInfo | undefined
    sourceType: SourceType
    fusionIdentityComparisons: number
    hasIdentityBackedMatches: boolean
}

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

    private sourcesByName: Map<string, SourceInfo> = new Map()
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
    private readonly currentRunUnmatchedFusionNativeIdentitiesBySource: Map<string, Set<string>> = new Map()
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
    /**
     * One-shot index of all account keys already linked in loaded Fusion rows.
     * Built once at the start of processManagedAccounts and cleared after the correlated pre-pass
     * so isCorrelatedManagedAccountLinkedInFusion can do O(1) lookups instead of O(A+I) scans.
     */
    private _linkedAccountKeyIndex: Set<string> | undefined

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
        this.managedAccountsBatchSize = config.managedAccountsBatchSize ?? defaults.managedAccountsBatchSize
    }

    /**
     * Fusion/identity phases use Promise.all batches; each task runs a large synchronous preamble
     * before its first await. Capping concurrency avoids stacking tens of accounts on one turn.
     */
    private fusionParallelBatchSize(): number {
        return Math.max(1, Math.min(this.managedAccountsBatchSize, 12))
    }

    /**
     * Wraps promiseAllBatched with the service's configured batch size and an
     * automatically created progress logger. Removes the repetitive boilerplate
     * of calculating batchSize / total and wiring up createBatchProgressLogger.
     */
    private async batchProcess<T, R>(
        items: T[],
        label: string,
        fn: (item: T) => Promise<R>,
        batchSize?: number
    ): Promise<R[]> {
        const size = batchSize ?? this.fusionParallelBatchSize()
        return promiseAllBatched(
            items,
            fn,
            size,
            createBatchProgressLogger(this.log, label, items.length, size)
        )
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
     * Runtime commandType is not always populated by host environments.
     * Treat the standard account-list operation context as aggregation mode.
     */
    private isAggregationAccountListMode(): boolean {
        return this.commandType === StandardCommand.StdAccountList || this.operationContext === 'accountList'
    }

    /**
     * Populate match / deferred / non-match report slices during managed-account analysis.
     * SDKs may report `commandType` as account list for custom commands; `custom:dryrun` must still capture slices.
     */
    private shouldCaptureManagedAccountReportData(): boolean {
        return (
            this.fusionReportOnAggregation ||
            !this.isAggregationAccountListMode() ||
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
        await this.sources.patchSourceConfig(
            fusionSourceId,
            '/connectorAttributes/reset',
            false,
            'FusionService>disableReset'
        )
    }

    /**
     * Disable the forceAttributeRefresh flag in the source configuration.
     * This makes the "Force attribute refresh on next aggregation?" option transient.
     */
    public async disableForceAttributeRefresh(): Promise<void> {
        const { fusionSourceId } = this.sources
        await this.sources.patchSourceConfig(
            fusionSourceId,
            '/connectorAttributes/forceAttributeRefresh',
            false,
            'FusionService>disableForceAttributeRefresh'
        )
    }

    /** Clears the persisted fusion state in the source configuration. */
    public async resetState(): Promise<void> {
        const { fusionSourceId } = this.sources
        await this.sources.patchSourceConfig(
            fusionSourceId,
            '/connectorAttributes/fusionState',
            false,
            'FusionService>resetState'
        )
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
        this.log.info(
            `Pre-processing fusion accounts: loading ${fusionAccounts.length} fusion account record(s) from sources and registering them for fusion`
        )
        const results: FusionAccount[] = []
        await forEachBatched(fusionAccounts, async (x: Account) => {
            const fusionAccount = FusionAccount.fromFusionAccount(x)
            this.setFusionAccount(fusionAccount)
            results.push(fusionAccount)
        })
        this.log.info(
            `Fusion account pre-process finished: ${results.length} account(s) loaded and registered`
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
        this.log.info(
            `Processing fusion accounts: for each of ${fusionAccounts.length} fusion account(s), match managed accounts from the work queue and build fusion layers`
        )
        const results = await this.batchProcess(
            fusionAccounts,
            'Fusion accounts',
            async (x: Account) => {
                return await this.processFusionAccount(x)
            }
        )
        this.log.info(
            `Fusion accounts phase finished: ${results.length} fusion account(s) processed (managed accounts matched and layered)`
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
        // Single source of truth: forms.pendingCandidateIdentityIds and
        // forms.pendingReviewUrlsByCandidateId are populated from pending form instance
        // data (fetchFormData) and from forms created in the current run (createFusionForm).
        // Union both so async URL population or definition-only candidate resolution still restores status.
        const pendingCandidateIds = this.forms.pendingCandidateIdentityIds
        const { pendingReviewUrlsByReviewerId } = this.forms
        const pendingReviewUrlsByCandidateId = this.forms.pendingReviewUrlsByCandidateId ?? new Map<string, string[]>()
        const candidateIdsNeedingStatus = new Set<string>(pendingCandidateIds)
        for (const id of pendingReviewUrlsByCandidateId.keys()) {
            candidateIdsNeedingStatus.add(id)
        }

        // Clear stale transient state, re-apply candidate statuses, and sync attributes.
        // Sync the in-memory Sets back into each account's attribute bag so that
        // _attributeBag.current['statuses'] / ['reviews'] reflect the mutations.
        // Without this, anything reading fusionAccount.attributes between now and
        // getISCAccount (attribute mapping, report generation, etc.) would see stale values.
        for (const account of this.fusionAccountMap.values()) {
            account.removeStatus('candidate')
            account.clearFusionReviews()

            const iid = account.identityId
            if (iid && candidateIdsNeedingStatus.has(iid)) {
                account.addStatus('candidate')
            }

            account.syncCollectionAttributesToBag()
        }

        for (const [identityId, identity] of this.fusionIdentityMap.entries()) {
            identity.removeStatus('candidate')
            identity.clearFusionReviews()

            if (candidateIdsNeedingStatus.has(identityId)) {
                identity.addStatus('candidate')
            }

            const urls = pendingReviewUrlsByReviewerId.get(identityId)
            if (urls?.length) {
                for (const url of urls) {
                    identity.addFusionReview(url)
                }
            }

            identity.syncCollectionAttributesToBag()
        }
    }

    /**
     * Refresh pending form data and reconcile transient candidate/reviewer output state.
     *
     * Used by single-account operations before serializing ISC account output.
     */
    public async normalizePendingFormStateForOutput(): Promise<void> {
        this.log.info('Normalizing pending form state for output (candidates + reviewer links)')
        await this.forms.fetchFormData()
        this.reconcilePendingFormState()
    }

    /**
     * Refresh unique attributes for all fusion accounts and identities in batches.
     */
    public async refreshUniqueAttributes(): Promise<number> {
        const allAccounts = [...this.fusionAccounts, ...this.fusionIdentities]
        await this.batchProcess(
            allAccounts,
            'Unique-attribute generation',
            (account) => this.attributes.refreshUniqueAttributes(account),
            this.managedAccountsBatchSize
        )
        return allAccounts.length
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

        // Replayed link-to-existing assignment already records a decision history line; do not append
        // the generic "Associated managed account …" for that same managed key (persisted accounts
        // list can lag identity until the next account write).
        let skipAssociationHistoryForManagedKeys: ReadonlySet<string> | undefined
        if (authorizedLinkDecision && !authorizedLinkDecision.newIdentity) {
            const rawKey = trimStr(authorizedLinkDecision.account.id) ?? ''
            const normalized = normalizeCompositeManagedAccountKey(rawKey)
            if (normalized) {
                skipAssociationHistoryForManagedKeys = new Set([normalized])
            }
        }

        // Pass direct reference to work queue - deletions will remove processed accounts
        // No snapshot or copy needed: JavaScript's event loop ensures atomic operations
        fusionAccount.addManagedAccountLayer(
            this.sources.managedAccountsById,
            this.sources.managedAccountsByIdentityId,
            this.sources.managedAccountsAllById,
            this.shouldPruneDeletedManagedAccounts(),
            true,
            skipAssociationHistoryForManagedKeys
        )
        this.log.debug(
            `Applied managed account layer for ${fusionAccount.name}: ` +
                `${fusionAccount.accountIdsSet.size} account(s), ${fusionAccount.missingAccountIdsSet.size} missing`
        )

        await yieldToEventLoop()

        if (!resetDefinition) {
            await this.attributes.registerUniqueAttributes(fusionAccount)
        }

        fusionAccount.setNeedsRefresh(
            fusionAccount.needsRefresh || refreshDefinition || refreshMapping || this.config.forceAttributeRefresh
        )
        fusionAccount.setNeedsReset(resetDefinition)

        this.attributes.mapAttributes(fusionAccount)
        await this.attributes.refreshNormalAttributes(fusionAccount)
        this.attributes.refreshReverseCorrelationAttributes(fusionAccount)

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
        const canDirectCorrelate = Boolean(fusionAccount.identityId)

        const directCorrelateIds: string[] = []

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
            }
            // mode === 'reverse' and 'none': skip (reverse correlation is handled via refreshReverseCorrelationAttributes)
        }

        // Recovery path: if decision payload has source context but account metadata is missing
        // from the managed-account map, still include that assigned key for direct correlation.
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

    }

    /**
     * Apply per-source correlation only during account-list aggregation when there are missing accounts.
     */
    private async applyPerSourceCorrelationIfNeeded(
        fusionAccount: FusionAccount,
        authorizedLinkDecision?: FusionDecision
    ): Promise<void> {
        if (!this.isAggregationAccountListMode()) return
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
        this.log.info(
            `Processing identity documents: creating or merging fusion accounts for ${identities.length} ISC identity document(s)`
        )
        const results = await this.batchProcess(
            identities,
            'Identity documents',
            (x) => this.processIdentity(x)
        )
         await this.initializeSourceReviewers()
         this.log.info(
             `Identity documents phase finished: ${identities.length} identity document(s) processed (fusion accounts created or updated from identities)`
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
            this.attributes.refreshReverseCorrelationAttributes(fusionAccount)

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
    private hasIntersectingManagedAccounts(account: FusionAccount, identityAccountIds: Set<string>): boolean {
        for (const id of account.accountIdsSet) {
            if (identityAccountIds.has(id)) {
                return true
            }
        }
        for (const id of account.missingAccountIdsSet) {
            if (identityAccountIds.has(id)) {
                return true
            }
        }
        return false
    }

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
            if (this.hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        // Check for accounts from stale identity IDs (identity was destroyed and recreated)
        for (const [existingIdentityId, account] of this.fusionIdentityMap.entries()) {
            if (existingIdentityId === identity.id) continue
            if (this.hasIntersectingManagedAccounts(account, identityAccountIds)) {
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
        this.log.info(
            `Processing fusion identity decisions: applying ${fusionIdentityDecisions.length} reviewer form decision(s) (new identity or merge into existing)`
        )

         const results = await this.batchProcess(
            fusionIdentityDecisions,
            'Fusion identity decisions',
            (x) => this.processFusionIdentityDecision(x)
        )
         this.log.info(
             `Fusion identity decisions phase finished: ${fusionIdentityDecisions.length} decision(s) applied`
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

        // Enrich submitter and selected identity display names for user-facing output.
        await this.enrichDecisionSubmitter(fusionDecision)
        let selectedIdentity = await this.enrichDecisionIdentityName(fusionDecision)

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
                selectedIdentity = await this.resolveIdentityBestEffort(fusionDecision.identityId)
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
        this.attributes.refreshReverseCorrelationAttributes(fusionAccount)

        // Authorized decisions update/merge an existing identity-backed fusion account in-place.
        if (isAuthorizedDecision) {
            await this.applyPerSourceCorrelationIfNeeded(fusionAccount, fusionDecision)
            fusionAccount.updateCorrelationStatus()
            this.setFusionAccount(fusionAccount)
        }

        // New-identity decisions branch by source policy: record keeps uniqueness reservation only,
        // orphan may queue disable action, authoritative emits a new fusion account.
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
                    const decisionManagedKey = trimStr(fusionDecision.account.id) ?? ''
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

    /**
     * Best-effort: enrich the submitter's display name from the identity cache (or live API in aggregation mode).
     * Mutates `decision.submitter.name` in-place when a label is found.
     */
    private async enrichDecisionSubmitter(decision: FusionDecision): Promise<void> {
        const submitterId = decision.submitter?.id
        if (!submitterId) return
        if (decision.submitter?.name || decision.submitter?.email) return

        try {
            const identity = await this.resolveIdentityBestEffort(submitterId)
            const label = identity?.displayName || identity?.name
            if (label) {
                decision.submitter.name = label
            }
        } catch {
            // Best-effort: fall back to submitterId if fetch fails
        }
    }

    /**
     * Best-effort: enrich the decision's `identityName` from the identity cache.
     * Returns the resolved identity document (if any) so the caller can reuse it
     * for the identity layer without a second lookup.
     */
    private async enrichDecisionIdentityName(decision: FusionDecision): Promise<IdentityDocument | undefined> {
        if (!decision.identityId || decision.identityName) return undefined

        try {
            const identity = this.identities.getIdentityById(decision.identityId)
            const label = identity?.displayName || identity?.name
            if (label) {
                decision.identityName = label
            }
            return identity
        } catch {
            // Best-effort: leave identityName undefined if fetch fails
            return undefined
        }
    }

    /**
     * Resolve an identity by ID: returns the cached document if available, otherwise
     * makes a live API call only during aggregation (non-aggregation modes are read-only).
     */
    private async resolveIdentityBestEffort(identityId: string): Promise<IdentityDocument | undefined> {
        try {
            const cached = this.identities.getIdentityById(identityId)
            if (cached) return cached
            return this.isAggregationAccountListMode()
                ? this.identities.fetchIdentityById(identityId)
                : undefined
        } catch {
            return undefined
        }
    }

    // ------------------------------------------------------------------------
    // Public Managed Account Processing Methods
    // ------------------------------------------------------------------------

/**
     * Process all managed accounts from the work queue.
     *
     * This is Phase 4 of the work queue depletion process:
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
     * - Uses per-phase snapshots to avoid iterator invalidation while work-queue entries are removed
     * - Configurable batch size (managedAccountsBatchSize, default 50) limits concurrent in-flight objects
     * - Non-matches store minimal report data; full FusionAccount only for matches
     * - Arrays cleared by generateReport() or clearAnalyzedAccounts() after use
     * - Processes bounded batches to improve throughput while preserving shared-state updates.
     *
     * @returns Empty array (side effects register accounts in fusionAccountMap/fusionIdentityMap)
     */
    public async processManagedAccounts(): Promise<void> {
        await this.initializeManagedAccountProcessing()
        await this.processCorrelatedManagedAccounts()
        const { processed, matchScoringMs } = await this.processUncorrelatedManagedAccounts()
        this.log.info(
            `Managed accounts phase finished: ${processed} analyzed (matching workflow complete)`
        )
    }

    private validateManagedSourceReviewers(): void {
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
    }

    private buildLinkedAccountKeyIndex(): void {
        // Build a one-shot flat index of every account key already linked in a loaded Fusion row.
        // isCorrelatedManagedAccountLinkedInFusion uses this for O(1) per-account lookups instead
        // of scanning fusionAccountMap + fusionIdentityMap (O(A+I)) for every correlated account.
        this._linkedAccountKeyIndex = new Set<string>()
        for (const fa of this.fusionAccountMap.values()) {
            for (const key of fa.accountIdsSet) this._linkedAccountKeyIndex.add(key)
            for (const key of fa.missingAccountIdsSet) this._linkedAccountKeyIndex.add(key)
        }
        for (const fa of this.fusionIdentityMap.values()) {
            for (const key of fa.accountIdsSet) this._linkedAccountKeyIndex.add(key)
            for (const key of fa.missingAccountIdsSet) this._linkedAccountKeyIndex.add(key)
        }
    }

    private async runCorrelatedManagedAccountPrePass(map: Map<string, Account>): Promise<void> {
        // Pre-pass: resolve all correlated managed accounts before uncorrelated scoring begins.
        // Orphan correlated accounts (correlated on the source but absent from any loaded Fusion row)
        // are registered as non-matches in fusionIdentityMap here, so they are immediately visible
        // as deferred-match candidates when uncorrelated accounts are scored in the main pass.
        const correlatedAccounts = [...map.values()].filter((a) => a.uncorrelated === false)
        if (correlatedAccounts.length === 0) {
            return
        }

        this.log.info(
            `Pre-pass: resolving ${correlatedAccounts.length} correlated managed account(s) before uncorrelated scoring`
        )
        await this.batchProcess(
            correlatedAccounts,
            'Correlated managed accounts',
            (account) => this.processManagedAccount(account),
            this._managedAccountProcessingBatchSize
        )
        this.log.info(`Pre-pass complete: ${map.size} uncorrelated account(s) queued for scoring`)
    }

    /**
     * Main pass: drains the remaining uncorrelated managed-account queue after the
     * correlated pre-pass has claimed linked/correlated entries.
     */
    private async runUncorrelatedManagedAccountPass(
        queuedAccounts: Account[],
        batchSize: number,
        managedAccountProcessingStartedAt: number
    ): Promise<number> {
        const initialQueueSize = queuedAccounts.length
        const logProgressEvery = Math.max(1, Math.min(this.managedAccountsBatchSize, initialQueueSize))
        let processed = 0

        const parallelAccounts: Account[] =
         []
        const deferredGroups = new Map<string, Account[]>()
        for (const account of queuedAccounts) {
            if (this.isDeferredMatchingEnabledForSource(account.sourceName ?? undefined)) {
                const sourceKey = this.deferredMatchingSourceKey(account.sourceName)
                const existing = deferredGroups.get(sourceKey)
                if (existing) existing.push(account)
                else deferredGroups.set(sourceKey, [account])
            } else {
                parallelAccounts.push(account)
            }
        }

        const logProgressIfNeeded = (): void => {
            if (processed === 1 || processed % logProgressEvery === 0 || processed === initialQueueSize) {
                this.log.info(
                    `Managed accounts progress: ${processed}/${initialQueueSize} analyzed | RUN ELAPSED ${PhaseTimer.formatElapsed(
                        Date.now() - managedAccountProcessingStartedAt
                    )}`
                )
            }
        }

        const runParallelAccounts = async (): Promise<void> => {
            for (let i = 0; i < parallelAccounts.length; i += batchSize) {
                const batch = parallelAccounts.slice(i, i + batchSize)
                await Promise.all(batch.map((account) => this.processManagedAccount(account)))
                processed += batch.length
                logProgressIfNeeded()
                await yieldToEventLoop()
            }
        }

        const runDeferredGroups = async (): Promise<void> => {
            const deferredGroupEntries = Array.from(deferredGroups.entries())
            await Promise.all(
                deferredGroupEntries.map(async ([sourceKey, accounts]) => {
                    let sequentiallyProcessed = 0
                    const deferredPhaseSequentialQueue: ManagedAccountAnalysisContext[] = []

                    // Phase A: preprocess + identity scoring in parallel for this source.
                    for (let i = 0; i < accounts.length; i += batchSize) {
                        const batch = accounts.slice(i, i + batchSize)
                        const phaseAResults = await Promise.all(
                            batch.map((account) => this.analyzeManagedAccountIdentityPhase(account))
                        )

                        for (const analysis of phaseAResults) {
                            if (analysis.hasIdentityBackedMatches) {
                                await this.completeManagedAccountFromAnalysis(analysis, false)
                                processed += 1
                                sequentiallyProcessed += 1
                                logProgressIfNeeded()
                            } else {
                                deferredPhaseSequentialQueue.push(analysis)
                            }
                        }
                        await yieldToEventLoop()
                    }

                    // Phase B: preserve same-aggregation visibility for this source only.
                    for (const analysis of deferredPhaseSequentialQueue) {
                        await this.analyzeManagedAccountDeferredPhase(analysis)
                        await this.completeManagedAccountFromAnalysis(analysis, true)
                        processed += 1
                        sequentiallyProcessed += 1
                        logProgressIfNeeded()
                        await yieldToEventLoop()
                    }

                    if (sequentiallyProcessed > 0) {
                        this.log.debug(
                            `Deferred same-aggregation pass for source "${sourceKey}" analyzed ${sequentiallyProcessed} account(s) (phaseA parallel, phaseB sequential)`
                        )
                    }
                })
            )
        }

        await Promise.all([runParallelAccounts(), runDeferredGroups()])

        return processed
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
     * Processes a single managed account through the Match workflow (or a correlated
     * orphan shortcut when the account is correlated on the source but not linked to
     * any loaded Fusion row).
     * After scoring, the account is either assigned automatically to the matched identity
     * (perfect scores when enabled), sent for manual review (partial match), or handled
     * based on the source type:
     * - authoritative: added as unmatched new identity (output as ISC account)
     * - record: unique attributes registered but not output as ISC account
     * - orphan: dropped immediately; optionally fires a disable operation
     *
     * @param account - The ISC account from a managed source (typically uncorrelated on the work queue)
     * @returns The fusion account produced or updated, or undefined if skipped or sent for manual review.
     *          Same-aggregation deferred matches (peer is another new unmatched account) are removed from
     *          the managed-account work queue for this run; they are expected to be re-fetched next aggregation.
     */
    public async processManagedAccount(account: Account): Promise<FusionAccount | undefined> {
        return processManagedAccount(
            {
                config: this.config,
                isAggregationAccountListMode: this.isAggregationAccountListMode(),
                sourcesByName: this.sourcesByName,
                sourcesWithoutReviewers: this._sourcesWithoutReviewers,
                isCorrelatedManagedAccountLinkedInFusion: (acct) => this.isCorrelatedManagedAccountLinkedInFusion(acct),
                removeManagedAccountFromWorkQueue: (acct) => this.removeManagedAccountFromWorkQueue(acct),
                preProcessManagedAccount: (acct) => this.preProcessManagedAccount(acct),
                analyzeManagedAccount: (acct) => this.analyzeManagedAccount(acct),
                handleNoReviewerAccount: (acct, type, info) => this.handleNoReviewerAccount(acct, type, info),
                handleNonMatch: (fusion, acct, type, info) => this.handleNonMatch(fusion, acct, type, info),
                handleExactMatch: (fusion, acct, id) => this.handleExactMatch(fusion, acct, id),
                handlePartialMatch: (fusion, info) => this.handlePartialMatch(fusion, info),
                handleDeferredMatch: (fusion, acct) => this.handleDeferredMatch(fusion, acct),
                hasIdentityBackedMatches: (fusion) => this.hasIdentityBackedMatches(fusion),
                hasNewUnmatchedPeerMatches: (fusion) => this.hasNewUnmatchedPeerMatches(fusion),
                logInfo: (msg) => this.log.info(msg),
            },
            account
        )
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

    private async handleNoReviewerAccount(
        account: Account,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined> {
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
        return this.finalizeAuthoritativeUnmatched(fusionAccount)
    }

    private async handleExactMatch(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): Promise<FusionAccount | undefined> {
        this.removeMatchAccount(fusionAccount.managedAccountId)
        this.log.debug(
            `Account ${account.name} [${fusionAccount.sourceName}] has all scores 100, automatic assignment to identity ${identityId}`
        )
        // Prevent subsequent managed accounts from scoring against this identity
        this.autoAssignedIdentityIds.add(identityId)
        const syntheticDecision = this.createAutomaticAssignmentDecision(fusionAccount, account, identityId)
        this.forms.registerFinishedDecision(syntheticDecision)
        return this.processFusionIdentityDecision(syntheticDecision)
    }

    private async handlePartialMatch(
        fusionAccount: FusionAccount,
        sourceInfo: SourceInfo | undefined
    ): Promise<undefined> {
        assert(sourceInfo, 'Source info not found')
        const reviewers = this._reviewersBySourceId.get(sourceInfo.id!)
        try {
            const outcome = await this.forms.createFusionForm(fusionAccount, reviewers)
            if (!outcome.formDefinitionReady) {
                const matchCount = fusionAccount.fusionMatches.length
                const maxForm = this.config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
                const message =
                    !reviewers || reviewers.size === 0
                        ? 'Match review form was not created: no reviewers available for this source'
                        : `Match review form was not created (${matchCount} potential match(es); form lists up to ${maxForm} highest-scoring candidate(s))`
                this.trackFailedMatching(fusionAccount, message)
            } else {
                const eligibleReviewerCount = [...(reviewers ?? [])].filter((r) => r.identityId).length
                if (eligibleReviewerCount > 0 && outcome.newReviewInstancesQueued === 0) {
                    // No new review work was queued (e.g. every eligible reviewer already had an open instance).
                    // matchAccounts was populated before form creation; drop so aggregation report/email counts stay accurate.
                    this.removeMatchAccount(fusionAccount.managedAccountId)
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.trackFailedMatching(fusionAccount, `Form creation failed: ${message}`)
        }
        fusionAccount.clearFusionIdentityReferences()
        return undefined
    }

    private handleDeferredMatch(fusionAccount: FusionAccount, account: Account): undefined {
        const deferredMatches = fusionAccount.fusionMatches.filter((m) => m.candidateType === 'new-unmatched')
        const { headline, summary } = FusionService.formatFusionMatchDiscoveryLog(deferredMatches, true)
        this.log.info(`${headline}: ${account.name} [${account.sourceName}] - ${summary}; skipping account for now`)
        this.removeManagedAccountFromWorkQueue(account)
        return undefined
    }

    private async handleNonMatch(
        fusionAccount: FusionAccount,
        account: Account,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined> {
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
        await this.finalizeAuthoritativeUnmatched(fusionAccount)
        const mk = getManagedAccountKeyFromAccount(account)
        this.log.debug(
            `Registered managed account as fusion account: ${account.name} [${account.sourceName}] (${mk ?? 'no-key'})`
        )
        return fusionAccount
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
        const analysis = await this.analyzeManagedAccountIdentityPhase(account)
        await this.analyzeManagedAccountDeferredPhase(analysis)
        this.recordManagedAccountAnalysis(analysis)
        return analysis.fusionAccount
    }

    private async analyzeManagedAccountIdentityPhase(account: Account): Promise<ManagedAccountAnalysisContext> {
        const { name, sourceName } = account
        const fusionAccount = await this.preProcessManagedAccount(account)
        const sourceInfo = account.sourceName ? this.sourcesByName.get(account.sourceName) : undefined
        const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative
        const recordMatchingEnabled = this.isRecordMatchingEnabledForSource(account.sourceName ?? undefined)
        let fusionIdentityComparisons = 0
        let hasIdentityBackedMatches = false

        if (recordMatchingEnabled) {
            const excludeIds =
                this.config.fusionMergingExactMatch && this.autoAssignedIdentityIds.size > 0
                    ? this.autoAssignedIdentityIds
                    : undefined
            const candidateSet = this.scoring.getCandidates(fusionAccount, excludeIds)
            const identityPool: Iterable<FusionAccount> =
                candidateSet ?? (excludeIds ? this.fusionIdentitiesExcluding(excludeIds) : this.fusionIdentities)
            const identityScoringStarted = Date.now()
            fusionIdentityComparisons = await this.scoring.scoreFusionAccount(
                fusionAccount,
                identityPool,
                MatchCandidateType.Identity,
                this.config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
            )
            this.currentRunMatchScoringMs += Date.now() - identityScoringStarted
            hasIdentityBackedMatches = this.hasIdentityBackedMatches(fusionAccount)
        } else {
            this.log.debug(
                `Skipping Match scoring for record source account: ${name} [${sourceName}] ` +
                    `(includeRecordAccountsForMatching=false)`
            )
        }

        return {
            account,
            fusionAccount,
            sourceInfo,
            sourceType,
            fusionIdentityComparisons,
            hasIdentityBackedMatches,
        }
    }

    private async analyzeManagedAccountDeferredPhase(analysis: ManagedAccountAnalysisContext): Promise<void> {
        if (analysis.hasIdentityBackedMatches) {
            return
        }
        if (!this.isDeferredMatchingEnabledForSource(analysis.account.sourceName ?? undefined)) {
            return
        }
        const deferredScoringStarted = Date.now()
        analysis.fusionIdentityComparisons += await this.scoring.scoreFusionAccount(
            analysis.fusionAccount,
            this.currentRunUnmatchedCandidatesForSource(analysis.account.sourceName),
            MatchCandidateType.NewUnmatched
        )
        this.currentRunMatchScoringMs += Date.now() - deferredScoringStarted
    }

    private async completeManagedAccountFromAnalysis(
        analysis: ManagedAccountAnalysisContext,
        deferredPhaseExecuted: boolean
    ): Promise<FusionAccount | undefined> {
        const { account, fusionAccount, sourceInfo, sourceType, hasIdentityBackedMatches } = analysis
        this.recordManagedAccountAnalysis(analysis)

        if (hasIdentityBackedMatches) {
            if (!this.isAggregationAccountListMode()) {
                fusionAccount.clearFusionIdentityReferences()
                return undefined
            }
            const perfectMatch = fusionAccount.fusionMatches.find((m) => hasAllAttributeScoresPerfect(m))
            if (this.config.fusionMergingExactMatch && perfectMatch?.identityId) {
                return this.handleExactMatch(fusionAccount, account, perfectMatch.identityId)
            }
            return this.handlePartialMatch(fusionAccount, sourceInfo)
        }

        if (!deferredPhaseExecuted) {
            return undefined
        }
        if (this.hasNewUnmatchedPeerMatches(fusionAccount)) {
            return this.handleDeferredMatch(fusionAccount, account)
        }
        return this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
    }

    private recordManagedAccountAnalysis(analysis: ManagedAccountAnalysisContext): void {
        const { account, fusionAccount, sourceType, hasIdentityBackedMatches, fusionIdentityComparisons } = analysis
        const { name, sourceName } = account
        this.fusionIdentityComparisonsByAccount.set(fusionAccount, fusionIdentityComparisons)
        if (fusionAccount.isMatch) {
            if (hasIdentityBackedMatches) {
                const identityMatches = fusionAccount.fusionMatches.filter(
                    (m) => (m.candidateType ?? 'identity') === 'identity'
                )
                const { headline, summary } = FusionService.formatFusionMatchDiscoveryLog(identityMatches, false)
                this.log.info(`${headline}: ${name} [${sourceName}] - ${summary}`)
            }
            if (!this.shouldCaptureManagedAccountReportData()) return
            const reportAccountId = this.resolveReportAccountId(fusionAccount)
            if (hasIdentityBackedMatches) {
                this.matchAccounts.push(fusionAccount)
                return
            }
            const deferredMatches = fusionAccount.fusionMatches
                .filter((match) => match.candidateType === 'new-unmatched')
                .map((match) => {
                    const fields = fusionReportMatchCandidateAccountFields(match)
                    const fi = match.fusionIdentity
                    const peerIdentityId = fi?.identityId
                    const peerManagedAccountReportId = this.resolveReportAccountIdValue(fi?.managedAccountId)
                    const candidateAccountReportId = this.resolveReportAccountIdValue(fields.accountId)
                    const identityUrl =
                        (peerIdentityId ? this.urlContext.identity(peerIdentityId) : undefined) ??
                        (peerManagedAccountReportId
                            ? this.urlContext.humanAccount(peerManagedAccountReportId)
                            : undefined) ??
                        (candidateAccountReportId ? this.urlContext.humanAccount(candidateAccountReportId) : undefined)
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
                    this.reportAttributes,
                    undefined,
                    reportAccountId
                ),
                deferred: true,
                fusionIdentityComparisons,
                matches: deferredMatches,
            })
            return
        }
        this.log.debug(`No match found for managed account: ${name} [${sourceName}]`)
        if (sourceType === SourceType.Authoritative && this.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)) {
            this.setFusionAccount(fusionAccount)
            this.registerCurrentRunUnmatchedCandidate(fusionAccount)
        }
        if (!this.shouldCaptureManagedAccountReportData()) return
        this.analyzedNonMatchReportData.push({
            ...buildMinimalFusionReportAccount(
                fusionAccount,
                this.urlContext,
                this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                this.reportAttributes,
                undefined,
                this.resolveReportAccountId(fusionAccount)
            ),
            fusionIdentityComparisons,
        })
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
        const sourceType = info?.sourceType ?? SourceType.Authoritative
        if (sourceType !== SourceType.Authoritative) return false
        if (!info?.config) return true
        return coerceBoolean(info.config.deferredMatching) ?? true
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
        return coerceBoolean(info?.config?.includeRecordAccountsForMatching) ?? true
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
                    error,
                    this.resolveReportAccountId(fusionAccount)
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

    /**
     * Reports should link to the ISC account id (not managed key).
     * Fall back to managed key when the account isn't present in source caches.
     */
    private resolveReportAccountId(fusionAccount: FusionAccount): string | undefined {
        const managedKey = fusionAccount.managedAccountId
        if (!managedKey) return undefined
        return this.sources.resolveIscAccountIdForManagedKey(managedKey) ?? managedKey
    }

    /**
     * Report links should prefer ISC account id. Inputs may already be ISC ids or managed keys.
     */
    private resolveReportAccountIdValue(accountId?: string): string | undefined {
        if (!accountId) return undefined
        return this.sources.resolveIscAccountIdForManagedKey(accountId) ?? accountId
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

        const results = await this.batchProcess(eligible, 'ISC accounts', (x) => this.getISCAccount(x))
        return compact(results)
    }

    /**
     * Streams each ISC account to the provided callback as soon as it's ready.
     * Memory optimization: avoids accumulating the full output array - processes
     * and sends one at a time instead of building the whole array first.
     *
     * @param send - Callback invoked with each account output (e.g. res.send)
     * @returns Number of accounts sent and number of eligible accounts
     */
    public async forEachISCAccount(send: (account: StdAccountListOutput) => void): Promise<{ sent: number; eligible: number }> {
        const shouldFilter = this.deleteEmpty
        const batchSize = this.fusionParallelBatchSize()
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

         const totalEligible = eligibleAccounts.length
         const totalBatches = Math.ceil(totalEligible / batchSize)
         const logProgressEveryBatch = Math.max(1, Math.min(50, Math.ceil(totalBatches / 20) || 1))
         for (let i = 0; i < eligibleAccounts.length; i += batchSize) {
             const batch = eligibleAccounts.slice(i, i + batchSize)
             const outputBatch = await Promise.all(batch.map((account) => this.getISCAccount(account, false)))
             for (const output of outputBatch) {
                 if (output) {
                     send(output)
                     count++
                 }
             }
             const processedInLoop = Math.min(i + batch.length, totalEligible)
             const currentBatch = Math.floor(i / batchSize) + 1
             if (
                 currentBatch === 1 ||
                 currentBatch % logProgressEveryBatch === 0 ||
                 currentBatch === totalBatches ||
                 processedInLoop === totalEligible
             ) {
                 this.log.info(
                     `Sending accounts progress: batches ${currentBatch}/${totalBatches} | eligible processed ${processedInLoop}/${totalEligible} | sent ${count}`
                 )
             }
             await yieldToEventLoop()
         }
return { sent: count, eligible: totalEligible }
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
        awaitCorrelations = true,
        recomputeCorrelationStatus = true
    ): Promise<StdAccountListOutput | undefined> {
        await fusionAccount.resolvePendingOperations(awaitCorrelations)
        // Update correlation status/action based on whatever correlations have resolved so far.
        // accountUpdate may skip this to preserve explicit entitlement removals in the immediate response.
        if (recomputeCorrelationStatus) {
            fusionAccount.updateCorrelationStatus()
        }
        // Match forms: ensure this exact row reflects FormService pending state at output time.
        // Global reconcile runs during aggregation, but accountRead and edge paths only guarantee
        // correctness if we re-apply pending candidate + reviewer URLs here (mirrors reviewer
        // handling in processFusionAccount via populateReviewerFusionReviewsFromPending).
        this.ensurePendingFormDerivedCollectionStateForOutput(fusionAccount)
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
        const schemaAttributes = new Set(this.schemas.listSchemaAttributeNames())
        const disabled = fusionAccount.disabled

        // Data-driven collection attribute overrides — all follow the same pattern.
        const collectionOverrides: Record<string, any> = {
            sources: attrConcat(Array.from(fusionAccount.sources)),
            accounts: Array.from(fusionAccount.accountIds),
            history: fusionAccount.history,
            'missing-accounts': Array.from(fusionAccount.missingAccountIds),
            reviews: Array.from(fusionAccount.reviews),
            statuses: Array.from(fusionAccount.statuses),
            actions: Array.from(fusionAccount.actions),
        }
        for (const [key, value] of Object.entries(collectionOverrides)) {
            if (schemaAttributes.has(key)) {
                attributes[key] = value
            }
        }
        // Conditional overrides: only set when the value is truthy (not just when schema declares the attribute).
        if (fusionAccount.originSource && schemaAttributes.has('originSource')) {
            attributes.originSource = fusionAccount.originSource
        }
        if (fusionAccount.originAccountId && schemaAttributes.has('originAccount')) {
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
     * Apply pending fusion Match form URLs and candidate status for this account's identityId.
     * Idempotent: safe to call after reconcilePendingFormState and before syncCollectionAttributesToBag.
     */
    private ensurePendingFormDerivedCollectionStateForOutput(fusionAccount: FusionAccount): void {
        const identityId = fusionAccount.identityId
        if (!identityId) {
            return
        }

        const pendingCandidates = this.forms.pendingCandidateIdentityIds ?? new Set<string>()
        const needsCandidate = pendingCandidates.has(identityId)
        if (needsCandidate) {
            fusionAccount.addStatus('candidate')
        }

        if (fusionAccount.listReviewerSources().length > 0) {
            const reviewerUrls = this.forms.pendingReviewUrlsByReviewerId.get(identityId)
            if (reviewerUrls?.length) {
                for (const u of reviewerUrls) {
                    fusionAccount.addFusionReview(u)
                }
            }
        }
    }

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

    /**
     * True when this managed account is already represented on a loaded Fusion account
     * (platform Fusion row or identity-backed Fusion row), or when its identityId matches
     * a loaded identity-backed Fusion account.
     *
     * Uses _linkedAccountKeyIndex (O(1)) when available (set by processManagedAccounts pre-pass),
     * falling back to a linear scan of fusionAccountMap + fusionIdentityMap for standalone calls.
     */
    private isCorrelatedManagedAccountLinkedInFusion(account: Account): boolean {
        const key = getManagedAccountKeyFromAccount(account)
        if (key) {
            const index = this._linkedAccountKeyIndex
            if (index) {
                if (index.has(key)) return true
            } else {
                for (const fa of this.fusionAccountMap.values()) {
                    if (fa.accountIdsSet.has(key) || fa.missingAccountIdsSet.has(key)) return true
                }
                for (const fa of this.fusionIdentityMap.values()) {
                    if (fa.accountIdsSet.has(key) || fa.missingAccountIdsSet.has(key)) return true
                }
            }
        }
        const identityId = account.identityId
        if (hasValue(identityId) && this.fusionIdentityMap.has(identityId)) {
            return true
        }
        return false
    }

    private queueDisableOperation(account: Account): void {
        if (!this.isAggregationAccountListMode()) {
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
        if (!nativeIdentity || !this.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)) return
        const sourceKey = this.deferredMatchingSourceKey(fusionAccount.sourceName)
        if (!sourceKey) return
        const setForSource = this.currentRunUnmatchedFusionNativeIdentitiesBySource.get(sourceKey) ?? new Set<string>()
        setForSource.add(nativeIdentity)
        this.currentRunUnmatchedFusionNativeIdentitiesBySource.set(sourceKey, setForSource)
    }

    private deferredMatchingSourceKey(sourceName: string | null | undefined): string {
        return sourceName ?? ''
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
            this.isAggregationAccountListMode() ||
            this.commandType === StandardCommand.StdAccountRead ||
            this.commandType === StandardCommand.StdAccountUpdate ||
            this.commandType === StandardCommand.StdAccountEnable ||
            this.commandType === StandardCommand.StdAccountDisable
        )
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
        const reviewers: Set<FusionAccount> = this._reviewersBySourceId.get(sourceId) ?? new Set()
        reviewers.add(fusionAccount)
        this._reviewersBySourceId.set(sourceId, reviewers)
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
     * Build the sources-by-name lookup and, when the fusion owner acts as a global reviewer,
     * register every managed source as a reviewer source and populate pending reviews.
     */
    private async initializeSourceReviewers(): Promise<void> {
        this.sourcesByName = new Map(
            this.sources.managedSources.map((source) => [source.name, source])
        )

        if (!this.fusionOwnerIsGlobalReviewer) {
            return
        }

        const globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
        for (const reviewerId of globalOwnerIds) {
            const reviewer = this.fusionIdentityMap.get(reviewerId)
            if (!reviewer) {
                continue
            }
            for (const source of this.sources.managedSources) {
                this.setReviewerForSource(reviewer, source.id!)
            }
            this.populateReviewerFusionReviewsFromPending(reviewer)
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
        this.attributes.refreshReverseCorrelationAttributes(fusionAccount)

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

    public currentRunUnmatchedCandidatesForSource(sourceName: string | null | undefined): Iterable<FusionAccount> {
        return this._currentRunUnmatchedCandidatesIterableForSource(this.deferredMatchingSourceKey(sourceName))
    }

    /** Generator that yields unmatched candidates without allocating intermediate arrays. */
    private *_currentRunUnmatchedCandidatesIterableForSource(sourceKey: string): Iterable<FusionAccount> {
        const sourceCandidates = this.currentRunUnmatchedFusionNativeIdentitiesBySource.get(sourceKey)
        if (!sourceCandidates) return
        for (const nativeIdentity of sourceCandidates) {
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

    /** Get reviewers by source ID map */
    public get reviewersBySourceId(): Map<string, Set<FusionAccount>> {
        return this._reviewersBySourceId
    }

    private _managedAccountProcessingState: 'idle' | 'initialized' = 'idle'
    private _managedAccountProcessingStartedAt = 0
    private _managedAccountProcessingBatchSize = 0

    private _ensureManagedAccountProcessingInitialized(): void {
        if (this._managedAccountProcessingState !== 'initialized') {
            throw new Error('initializeManagedAccountProcessing must be called before managed account processing')
        }
    }

    /** Initialize managed account processing state: rebuilt trigram index, linked account key index, and reviewer validation. */
    public async initializeManagedAccountProcessing(): Promise<void> {
        if (this._managedAccountProcessingState !== 'idle') {
            throw new Error('Managed account processing already initialized')
        }
        const map = this.sources.managedAccountsById
        assert(map, 'Managed accounts have not been loaded')

        this._managedAccountProcessingBatchSize = Math.max(1, this.managedAccountsBatchSize)
        this._managedAccountProcessingStartedAt = Date.now()

        this.newManagedAccountsCount = map.size
        this.currentRunUnmatchedFusionNativeIdentitiesBySource.clear()
        this.autoAssignedIdentityIds.clear()
        this.currentRunMatchScoringMs = 0

        this.validateManagedSourceReviewers()

        // Build the trigram blocking index over all currently-loaded fusion identities so that
        // each managed account can skip the vast majority of identity comparisons.
        // The index is rebuilt each run (identity pool may change between runs).
        this.scoring.buildTrigramIndex(this.fusionIdentities)

        this.buildLinkedAccountKeyIndex()

        this._managedAccountProcessingState = 'initialized'
    }

    /** Correlated pre-pass: resolve linked/correlated managed accounts before uncorrelated scoring. */
    public async processCorrelatedManagedAccounts(): Promise<void> {
        this._ensureManagedAccountProcessingInitialized()
        const map = this.sources.managedAccountsById
        await this.runCorrelatedManagedAccountPrePass(map)
        this._linkedAccountKeyIndex = undefined
    }

    /**
     * Uncorrelated main pass: drain remaining work-queue entries after the correlated pre-pass.
     * @returns Processed count and match scoring duration for metric emission.
     */
    public async processUncorrelatedManagedAccounts(): Promise<{ processed: number; matchScoringMs: number }> {
        this._ensureManagedAccountProcessingInitialized()
        const map = this.sources.managedAccountsById
        const queuedAccounts = [...map.values()]
        const initialQueueSize = queuedAccounts.length
        this.log.info(
            `Processing ${initialQueueSize} managed account(s): analyzing uncorrelated work-queue entries (matching and scoring vs identities)`
        )
        const processed = await this.runUncorrelatedManagedAccountPass(
            queuedAccounts,
            this._managedAccountProcessingBatchSize,
            this._managedAccountProcessingStartedAt
        )
        this._managedAccountProcessingState = 'idle'
        return { processed, matchScoringMs: this.currentRunMatchScoringMs }
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
        const hasIdentityId = hasValue(identityId)

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
        const report = buildFusionReport(
            {
                conflictingFusionIdentityAccounts: this.conflictingFusionIdentityAccounts,
                matchAccounts: this.matchAccounts,
                failedMatchingAccounts: this.failedMatchingAccounts,
                deferredMatchReportData: this.deferredMatchReportData,
                analyzedNonMatchReportData: this.analyzedNonMatchReportData,
                newManagedAccountsCount: this.newManagedAccountsCount,
                urlContext: this.urlContext,
                sourcesByName: this.sourcesByName,
                reportAttributes: this.reportAttributes,
                fusionIdentityComparisonsByAccount: this.fusionIdentityComparisonsByAccount,
                resolveReportAccountId: (account) => this.resolveReportAccountId(account),
            },
            includeNonMatches,
            stats
        )

        this.clearAnalyzedAccounts()

        return report
    }


    private hasIdentityBackedMatches(fusionAccount: FusionAccount): boolean {
        return fusionAccount.fusionMatches.some((match) => (match.candidateType ?? 'identity') === 'identity')
    }

    private hasNewUnmatchedPeerMatches(fusionAccount: FusionAccount): boolean {
        return fusionAccount.fusionMatches.some((match) => match.candidateType === 'new-unmatched')
    }
}
