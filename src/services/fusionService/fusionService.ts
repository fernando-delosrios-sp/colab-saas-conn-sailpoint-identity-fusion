import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { StdAccountListOutput, StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceType } from '../../model/config'
import { LogService, PhaseTimer } from '../logService'
import { FormService } from '../formService'
import { defaultFusionMaxCandidatesForForm } from '../../data/config'
import { IdentityService } from '../identityService'
import { SourceInfo, SourceService } from '../sourceService'
import { FusionAccount } from '../../model/account'
import { AttributeService } from '../attributeService'
import { assert } from '../../utils/assert'
import { createUrlContext, UrlContext } from '../../utils/url'
import {
    mapValuesToArray,
    forEachBatched,
    compact,
} from './collections'
import { FusionDecision } from '../../model/form'
import { ScoringService } from '../scoringService'
import { SchemaService } from '../schemaService'
import { FusionMatch, MatchCandidateType } from '../scoringService/types'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { COMBINED_SCORE_ROW_ATTRIBUTE } from '../scoringService/scoringService'
import { FusionReport, FusionReportAccount as _FusionReportAccount, FusionReportStats, OperationContext } from './types'
import {
    batchProcess as batchProcessWithConfig,
    getManagedAccountsBatchSize,
    getManagedAccountEventLoopYieldEvery,
    getFusionParallelBatchSize,
    yieldToEventLoop,
} from './batching'
import { buildFusionReport } from './fusionReportBuilder'
import { AggregationTracker } from './aggregationTracker'
import {
    buildMinimalFusionReportAccount,
    fusionReportMatchCandidateAccountFields,
    mapScoreReportsForFusionReport,
    createAutomaticAssignmentDecision,
    formatFusionMatchDiscoveryLog,
    hasIdentityBackedMatches as checkHasIdentityBackedMatches,
    hasNewUnmatchedPeerMatches as checkHasNewUnmatchedPeerMatches,
} from './helpers'
import { AttributeOperations } from '../attributeService/types'
import {
    getManagedAccountKeyFromAccount,
    normalizeCompositeManagedAccountKey,
} from '../../model/managedAccountKey'
import { StatusEntitlement } from '../../model/statusEntitlement'
import { hasValue, trimStr } from '../../utils/safeRead'
import { FusionAccountRepository } from './fusionAccountRepository'
import { IdentityProcessor } from './identityProcessor'
import { CorrelationManager } from './correlationManager'
import { DecisionProcessor } from './decisionProcessor'
import { ManagedAccountAnalyzer, ManagedAccountAnalysisContext } from './managedAccountAnalyzer'

// ============================================================================
// FusionService Class
// ============================================================================

/**
 * Service for identity fusion logic.
 * Pure in-memory operations - no ClientService dependency.
 * All data structures are passed in as parameters.
 */
export class FusionService {
    private _repository: FusionAccountRepository
    private identityProcessor: IdentityProcessor
    public correlationManager: CorrelationManager
    private decisionProcessor: DecisionProcessor
    private managedAccountAnalyzer: ManagedAccountAnalyzer

    public get fusionIdentityMap(): Map<string, FusionAccount> { return this._repository.fusionIdentityMap }
    public get fusionAccountMap(): Map<string, FusionAccount> { return this._repository.fusionAccountMap }
    public get _reviewersBySourceId(): Map<string, Set<FusionAccount>> { return this._repository.reviewersBySourceId }
    public get _sourcesWithoutReviewers(): Set<string> { return this._repository.sourcesWithoutReviewers }
    public get currentRunUnmatchedFusionNativeIdentitiesBySource(): Map<string, Set<string>> { return this._repository.currentRunUnmatchedFusionNativeIdentitiesBySource }
    public get autoAssignedIdentityIds(): Set<string> { return this._repository.autoAssignedIdentityIds }
    public get _linkedAccountKeyIndex(): Set<string> | undefined { return this._repository.linkedAccountKeyIndex }
    public set _linkedAccountKeyIndex(value: Set<string> | undefined) { this._repository.linkedAccountKeyIndex = value }

    private _tracker?: AggregationTracker

    public sourcesByName: Map<string, SourceInfo> = new Map()
    private readonly reset: boolean
    private readonly reportAttributes: string[]
    public readonly urlContext: UrlContext
    private readonly deleteEmpty: boolean
    private readonly pendingDisableOperations: Set<Promise<void>> = new Set()
    /** Cached set of configured source names — built once in the constructor (config is immutable). */
    public readonly configSourceNames: Set<string>
    public readonly fusionOwnerIsGlobalReviewer: boolean
    public readonly fusionReportOnAggregation: boolean
    public readonly commandType?: StandardCommand
    /** Connector operation name (e.g. {@link OperationContext.AccountList}) — used when SDK commandType alone is ambiguous. */
    private readonly operationContext?: OperationContext
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
     * @param operationContext - Handler operation name from the connector (e.g. {@link OperationContext.CustomDryRun})
     */
    constructor(
        public config: FusionConfig,
        public log: LogService,
        public identities: IdentityService,
        public sources: SourceService,
        public forms: FormService,
        public attributes: AttributeService,
        public scoring: ScoringService,
        public schemas: SchemaService,
        commandType?: StandardCommand,
        operationContext?: OperationContext
    ) {
        this._repository = new FusionAccountRepository(log)
        this.identityProcessor = new IdentityProcessor(this)
        this.correlationManager = new CorrelationManager(this)
        this.decisionProcessor = new DecisionProcessor(this)
        this.managedAccountAnalyzer = new ManagedAccountAnalyzer(this)
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
    }

    /**
     * Runs the provided function over items in bounded concurrent batches, logging progress.
     * Kept on FusionService so external callers (e.g. DecisionProcessor) do not need to
     * import batching utilities directly.
     */
    public async batchProcess<T, R>(
        items: T[],
        label: string,
        fn: (item: T) => Promise<R>,
        batchSize?: number
    ): Promise<R[]> {
        return batchProcessWithConfig(items, label, fn, this.config, this.log, batchSize)
    }

    /**
     * Runtime commandType is not always populated by host environments.
     * Treat the standard account-list operation context as aggregation mode.
     */
    public isAggregationAccountListMode(): boolean {
        return this.commandType === StandardCommand.StdAccountList || this.operationContext === OperationContext.AccountList
    }

    /**
     * Populate match / deferred / non-match report slices during managed-account analysis.
     * SDKs may report `commandType` as account list for custom commands; `custom:dryrun` must still capture slices.
     */
    private shouldCaptureManagedAccountReportData(): boolean {
        return (
            this.fusionReportOnAggregation ||
            !this.isAggregationAccountListMode() ||
            this.operationContext === OperationContext.CustomDryRun
        )
    }

    /**
     * Applies the standard attribute processing pipeline to a fusion account:
     * map source attributes, refresh normal attributes, then refresh reverse correlation attributes.
     */
    public async applyAttributeProcessing(fusionAccount: FusionAccount): Promise<void> {
        this.attributes.mapAttributes(fusionAccount)
        await this.attributes.refreshNormalAttributes(fusionAccount)
        this.attributes.refreshReverseCorrelationAttributes(fusionAccount)
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
     * Retrieves a Fusion identity from the in-memory map by ISC identity ID.
     * A Fusion identity is a Fusion account that became an identity.
     *
     * @param identityId - The ISC identity ID to look up
     * @returns The Fusion account for this identity, or undefined if not found
     */
    public getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.fusionIdentityMap.get(identityId)
    }

    /**
     * Sets the AggregationTracker instance to record report state.
     */
    public setTracker(tracker: AggregationTracker): void {
        this._tracker = tracker
    }

    /**
     * Retrieves the AggregationTracker instance.
     */
    public get tracker(): AggregationTracker {
        this.log.assert(!!this._tracker, 'AggregationTracker has not been set on FusionService')
        if (!this._tracker) {
            this.log.crash('AggregationTracker has not been set on FusionService')
        }
        return this._tracker!
    }

    /** Helper getters for stats that delegate to tracker if available */
    public get newManagedAccountsCount(): number {
        return this._tracker?.newManagedAccountsCount ?? 0
    }

    public get identitiesProcessedCount(): number {
        return this._tracker?.identitiesProcessedCount ?? 0
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
     * in the internal maps (identity-linked Fusion account map / fusionAccountMap) via setFusionAccount.
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
        this.log.info(`Fusion account pre-process finished: ${results.length} account(s) loaded and registered`)
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
        const results = await this.batchProcess(fusionAccounts, 'Fusion accounts', async (x: Account) => {
            return await this.processFusionAccount(x)
        })
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
        this.decisionProcessor.reconcilePendingFormState()
    }

    /**
     * Refresh pending form data and reconcile transient candidate/reviewer output state
     * for the single account being processed.
     *
     * Single-account operations (create/read/enable/disable) handle one identity at a time,
     * but the shared form/decision state can carry transient 'candidate' and reviewer
     * 'reviews' entries from other accounts processed in the same lifecycle. Before
     * serializing the ISC account output, this method:
     * 1. Re-fetches the latest pending form instances via {@link FusionForms.fetchFormData}
     *    so the current account's pending decisions are reflected.
     * 2. Calls {@link reconcilePendingFormState} to drop stale 'candidate' / 'reviews'
     *    entries (which may reference accounts not present in this operation) and
     *    rebuild them from the currently-known pending (unanswered) form instances,
     *    so the serialized output only references the account being returned.
     */
    public async normalizePendingFormStateForOutput(): Promise<void> {
        await this.decisionProcessor.normalizePendingFormStateForOutput()
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
            getManagedAccountsBatchSize(this.config)
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
        },
        originIdentityInScope?: boolean
    ): Promise<FusionAccount> {
        const { refreshMapping, refreshDefinition, resetDefinition } = attributeOperations
        const fusionAccount = FusionAccount.fromFusionAccount(account)
        this.log.debug(
            `Pre-processing fusion account: ${fusionAccount.name} (${account.nativeIdentity}), ` +
            `identityId=${fusionAccount.identityId ?? 'none'}, disabled=${fusionAccount.disabled}, uncorrelated=${fusionAccount.uncorrelated}`
        )

        assert(this.sources.managedAccountsById, 'Managed accounts have not been loaded')

        const reviewerSources = fusionAccount.listReviewerSources()
        reviewerSources.forEach((sourceId) => this.setReviewerForSource(fusionAccount, sourceId))
        if (reviewerSources.length > 0) {
            this.populateReviewerFusionReviewsFromPending(fusionAccount)
        }

        let authorizedLinkDecision: FusionDecision | undefined
        // Apply the identity layer whenever the fusion account references an identity and we have
        // that document in scope. Platform `uncorrelated` on the fusion Account means pending
        // managed-account correlation work, not "ignore the identity" — skipping the layer left
        // stale account.name (e.g. managed native id) as the hosting label and broke identity-
        // backed display attributes when originSource/baseline implied identity origin.
        if (fusionAccount.identityId) {
            const { identityId } = fusionAccount
            const identity = this.identities.getIdentityById(identityId)
            if (identity) {
                fusionAccount.addIdentityLayer(identity)
            }
            // Identity ID is already on _identityInfo: fromFusionAccount populated it from
            // buildIdentityInfo when account.identityId is set, or from the persisted
            // attributes.identityId attribute otherwise. No re-registration is needed here.

            authorizedLinkDecision = this.forms.getFusionAssignmentDecision(identityId)
            if (authorizedLinkDecision) {
                fusionAccount.addFusionDecisionLayer(authorizedLinkDecision)
            }
            this.log.debug(`Applied identity layer for ${fusionAccount.name}: identityId=${identityId}`)
        }

        // Replayed assignments and new identity decisions already record a decision history line;
        // do not append the generic "Associated managed account …" for that same managed key
        // (persisted accounts list can lag identity until the next account write).
        let skipAssociationHistoryForManagedKeys: ReadonlySet<string> | undefined
        if (authorizedLinkDecision) {
            const rawKey = trimStr(authorizedLinkDecision.account.id) ?? ''
            const normalized = normalizeCompositeManagedAccountKey(rawKey)
            if (normalized) {
                skipAssociationHistoryForManagedKeys = new Set([normalized])
            }
        }

        // Identity-origin accounts: record whether the origin identity is still in scope
        // so the orphan decision in addManagedAccountLayer can include them.
        // When a caller has already computed this (e.g. single-account rebuild), use the provided value.
        if (fusionAccount.fromIdentity && fusionAccount.originIdentityInScope === undefined) {
            const originIdentityId = fusionAccount.originAccountId ?? fusionAccount.identityId
            const inScope =
                originIdentityId && originIdentityInScope !== undefined
                    ? originIdentityInScope
                    : originIdentityId
                        ? this.identities.hasIdentityInScope(originIdentityId)
                        : false
            fusionAccount.setOriginIdentityInScope(inScope)
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

        await this.applyAttributeProcessing(fusionAccount)

        // Per-source correlation for missing accounts during aggregation
        await this.correlationManager.applyPerSourceCorrelationIfNeeded(fusionAccount, authorizedLinkDecision)

        // Sync _uncorrelated flag with actual _missingAccountIds state so that
        // setFusionAccount routes the account to the correct map (identity-linked
        // Fusion account map vs fusionAccountMap). Without this, optimistic correlations from
        // correlatePerSource leave _uncorrelated stale.
        fusionAccount.updateCorrelationStatus()

        this.log.debug(
            `Completed processing fusion account: ${fusionAccount.name}, ` +
            `needsRefresh=${fusionAccount.needsRefresh}, sources=[${fusionAccount.sources.join(', ')}]`
        )

        this.setFusionAccount(fusionAccount)

        // Explicitly deplete the identity work queue so processIdentities skips
        // this identity without relying solely on the identity-linked Fusion account map guard.
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
     * Run per-source correlation for missing accounts (direct PATCH and/or reverse attributes).
     * Use when correlation must run outside account-list aggregation (e.g. correlate entitlement action).
     */
    public async correlateMissingAccountsPerSource(fusionAccount: FusionAccount): Promise<void> {
        await this.correlationManager.correlateMissingAccountsPerSource(fusionAccount)
    }

    // ------------------------------------------------------------------------
    // Public Identity Processing Methods
    // ------------------------------------------------------------------------

    /**
     * Process all identities.
     * Delegates to IdentityProcessor.
     */
    public async processIdentities(): Promise<FusionAccount[]> {
        return this.identityProcessor.processIdentities()
    }

    /**
     * Process a single identity.
     * Delegates to IdentityProcessor.
     */
    public async processIdentity(identity: IdentityDocument): Promise<FusionAccount | undefined> {
        return this.identityProcessor.processIdentity(identity)
    }

    /**
     * Process all Fusion identity decisions (new identity).
     * A Fusion identity is a Fusion account that became an identity.
     * Candidate status is handled by processFusionAccounts, since pending form
     * candidates are always existing fusion accounts.
     *
     * @returns The fusion accounts produced by the new identity decisions
     */
    public async processFusionIdentityDecisions(): Promise<FusionAccount[]> {
        return this.decisionProcessor.processFusionIdentityDecisions()
    }

    /**
     * Processes a single Fusion identity decision (reviewer form response).
     * Creates a new Fusion identity (a Fusion account that became an identity) for
     * "new identity" decisions, or merges into an existing one for "authorized" decisions.
     *
     * For record/orphan source types, "new identity" (toggle true) means "no match":
     * - record: registers unique attributes but does not output as ISC account
     * - orphan: drops the account; optionally fires a disable operation
     *
     * @param fusionDecision - The reviewer's decision from the review form
     * @returns The fusion account produced or updated, or undefined if the decision was skipped
     */
    public async processFusionIdentityDecision(fusionDecision: FusionDecision): Promise<FusionAccount | undefined> {
        return this.decisionProcessor.processFusionIdentityDecision(fusionDecision)
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
     * - Configurable batch size (managedAccountsBatchSize, default 100) limits concurrent in-flight objects
     * - Non-matches store minimal report data; full FusionAccount only for matches
     * - Tracker state cleared by generateReport() after use
     * - Processes bounded batches to improve throughput while preserving shared-state updates.
     *
     * @returns Empty array (side effects register accounts in fusionAccountMap / identity-linked Fusion account map)
     */
    public async processManagedAccounts(): Promise<void> {
        await this.initializeManagedAccountProcessing()
        await this.processCorrelatedManagedAccounts()
        const { processed } = await this.processUncorrelatedManagedAccounts()
        this.log.info(`Managed accounts phase finished: ${processed} analyzed (matching workflow complete)`)
    }

    private validateManagedSourceReviewers(): void {
        this._sourcesWithoutReviewers.clear()
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
        // of scanning fusionAccountMap + identity-linked Fusion account map (O(A+I)) for every correlated account.
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
        // are registered as non-matches in the identity-linked Fusion account map here, so they are immediately visible
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
        const logProgressEvery = Math.max(1, Math.min(getManagedAccountsBatchSize(this.config), initialQueueSize))
        let processed = 0

        const parallelAccounts: Account[] = []
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
                            batch.map((account) => this.managedAccountAnalyzer.analyzeIdentityPhase(account))
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

                    // Phase B: preserve deferred-matching visibility for this source only.
                    for (const analysis of deferredPhaseSequentialQueue) {
                        await this.managedAccountAnalyzer.analyzeDeferredPhase(analysis)
                        await this.completeManagedAccountFromAnalysis(analysis, true)
                        processed += 1
                        sequentiallyProcessed += 1
                        logProgressIfNeeded()
                        await yieldToEventLoop()
                    }

                    if (sequentiallyProcessed > 0) {
                        this.log.debug(
                            `Deferred matching pass for source "${sourceKey}" analyzed ${sequentiallyProcessed} account(s) (phaseA parallel, phaseB sequential)`
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
     *          Deferred-matching matches (peer is another new unmatched account from the same source) are removed from
     *          the managed-account work queue for this run; they are expected to be re-fetched next aggregation.
     */
    public async processManagedAccount(account: Account): Promise<FusionAccount | undefined> {
        const managedAccountKey = getManagedAccountKeyFromAccount(account)

        if (this.isCorrelatedManagedAccountLinkedInFusion(account)) {
            this.log.info(
                `Dropping managed account already linked in Fusion from work queue: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
            )
            this.removeManagedAccountFromWorkQueue(account)
            return undefined
        }

        // Resolve source context once — shared by all downstream paths.
        const sourceInfo = account.sourceName ? this.sourcesByName.get(account.sourceName) : undefined
        const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative

        if (account.sourceName && this._sourcesWithoutReviewers.has(account.sourceName)) {
            return this.handleNoReviewerAccount(account, sourceType, sourceInfo)
        }

        // Correlated on the source but not linked to any loaded Fusion row — treat as non-match.
        if (account.uncorrelated === false) {
            this.log.info(
                `Correlated managed account not linked to Fusion; treating as non-match: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
            )
            const fusionAccount = await this.preProcessManagedAccount(account)
            this.removeManagedAccountFromWorkQueue(account)
            return this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
        }

        const fusionAccount = await this.analyzeManagedAccount(account)
        const identityBackedMatches = checkHasIdentityBackedMatches(fusionAccount)
        const newUnmatchedPeerMatches = checkHasNewUnmatchedPeerMatches(fusionAccount)

        if (identityBackedMatches) {
            // Analysis-only runs (e.g. custom:dryrun): keep match report data but do not
            // register decisions or mutate fusion state as in a real aggregation.
            if (!this.isAggregationAccountListMode()) {
                fusionAccount.clearFusionIdentityReferences()
                return undefined
            }
            const bestMatch = this.getBestAutoAssignMatch(fusionAccount.fusionMatches)
            if (this.config.fusionEnableAutoAssignment && bestMatch?.identityId) {
                return this.handleExactMatch(fusionAccount, account, bestMatch.identityId)
            }
            return await this.handlePartialMatch(fusionAccount, sourceInfo)
        }

        if (newUnmatchedPeerMatches) {
            return this.handleDeferredMatch(fusionAccount, account)
        }

        return this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
    }

    /**
     * Finds the match with the highest combined score that meets or exceeds the automatic assignment threshold.
     */
    private getBestAutoAssignMatch(matches: FusionMatch[]): FusionMatch | undefined {
        if (this.config.fusionAutoAssignmentScore === undefined) return undefined

        let bestMatch: FusionMatch | undefined
        let highestScore = -1

        for (const m of matches) {
            const combinedReport = m.scores.find(
                (s) => s.attribute === COMBINED_SCORE_ROW_ATTRIBUTE
            )
            const score = combinedReport?.score ?? 0

            if (score >= this.config.fusionAutoAssignmentScore && score > highestScore) {
                highestScore = score
                bestMatch = m
            }
        }
        return bestMatch
    }

    /**
     * Applies the no-match source-type policy for Record and Orphan sources.
     * Returns true when the account was handled (caller should return undefined),
     * false when the source is Authoritative and the caller should proceed.
     */
    public async handleNonAuthoritativeNoMatch(
        fusionAccount: FusionAccount,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined,
        account?: Account
    ): Promise<boolean> {
        if (sourceType === SourceType.Record) {
            await this.attributes.registerUniqueAttributes(fusionAccount)
            return true
        }
        if (sourceType === SourceType.Orphan) {
            if (sourceInfo?.config?.disableNonMatchingAccounts && account) {
                this.queueDisableOperation(account)
            }
            return true
        }
        return false
    }

    private async handleNoReviewerAccount(
        account: Account,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined> {
        const fusionAccount = await this.preProcessManagedAccount(account)
        if (await this.handleNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, account)) {
            this.log.debug(
                `Account ${account.name} [${fusionAccount.sourceName}] has no reviewers and sourceType=${sourceType}, skipping`
            )
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
            `Account ${account.name} [${fusionAccount.sourceName}] meets the automatic assignment threshold, auto-assigning to identity ${identityId}`
        )
        // Prevent subsequent managed accounts from scoring against this identity
        this.autoAssignedIdentityIds.add(identityId)
        const syntheticDecision = createAutomaticAssignmentDecision(fusionAccount, account, identityId)
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
        const { headline, summary } = formatFusionMatchDiscoveryLog(deferredMatches, true)
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
        if (await this.handleNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, account)) {
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
        const yieldEveryManaged = getManagedAccountEventLoopYieldEvery(this.config)
        for (const account of map.values()) {
            const fusionAccount = await this.analyzeManagedAccount(account)
            if (
                fusionAccount.isMatch &&
                !checkHasIdentityBackedMatches(fusionAccount) &&
                checkHasNewUnmatchedPeerMatches(fusionAccount)
            ) {
                const deferredMatches = fusionAccount.fusionMatches.filter((m) => m.candidateType === MatchCandidateType.NewUnmatched)
                const { headline, summary } = formatFusionMatchDiscoveryLog(deferredMatches, true)
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
        const analysis = await this.managedAccountAnalyzer.analyzeIdentityPhase(account)
        await this.managedAccountAnalyzer.analyzeDeferredPhase(analysis)
        this.recordManagedAccountAnalysis(analysis)
        return analysis.fusionAccount
    }

    public addMatchScoringTimeMs(ms: number): void {
        this.currentRunMatchScoringMs += ms
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
            const bestMatch = this.getBestAutoAssignMatch(fusionAccount.fusionMatches)
            if (this.config.fusionEnableAutoAssignment && bestMatch?.identityId) {
                return this.handleExactMatch(fusionAccount, account, bestMatch.identityId)
            }
            return this.handlePartialMatch(fusionAccount, sourceInfo)
        }

        if (!deferredPhaseExecuted) {
            return undefined
        }
        if (checkHasNewUnmatchedPeerMatches(fusionAccount)) {
            return this.handleDeferredMatch(fusionAccount, account)
        }
        return this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
    }

    private recordManagedAccountAnalysis(analysis: ManagedAccountAnalysisContext): void {
        const { account, fusionAccount, sourceType, hasIdentityBackedMatches, fusionIdentityComparisons } = analysis
        const { name, sourceName } = account
        const tracker = this.tracker
        tracker.fusionIdentityComparisonsByAccount.set(fusionAccount, fusionIdentityComparisons)
        if (fusionAccount.isMatch) {
            if (hasIdentityBackedMatches) {
                const identityMatches = fusionAccount.fusionMatches.filter(
                    (m) => (m.candidateType ?? MatchCandidateType.Identity) === MatchCandidateType.Identity
                )
                const { headline, summary } = formatFusionMatchDiscoveryLog(identityMatches, false)
                this.log.info(`${headline}: ${name} [${sourceName}] - ${summary}`)
            }
            if (!this.shouldCaptureManagedAccountReportData()) return
            const reportAccountId = this.resolveReportAccountId(fusionAccount)
            if (hasIdentityBackedMatches) {
                tracker.matchAccounts.push(fusionAccount)
                return
            }
            const deferredMatches = fusionAccount.fusionMatches
                .filter((match) => match.candidateType === MatchCandidateType.NewUnmatched)
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
                        candidateType: MatchCandidateType.NewUnmatched,
                        exact: isExactAttributeMatchScores(match.scores),
                        scores: mapScoreReportsForFusionReport(match.scores),
                    }
                })
            tracker.deferredMatchReportData.push({
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
        if (
            sourceType === SourceType.Authoritative &&
            this.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)
        ) {
            this.setFusionAccount(fusionAccount)
            this.registerCurrentRunUnmatchedCandidate(fusionAccount)
        }
        if (!this.shouldCaptureManagedAccountReportData()) return
        tracker.analyzedNonMatchReportData.push({
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
     * Deferred matching.
     *
     * Default is enabled to preserve existing behavior unless explicitly disabled
     * per-source via config.
     */
    public isDeferredMatchingEnabledForSource(sourceName: string | undefined): boolean {
        return this.managedAccountAnalyzer.isDeferredMatchingEnabledForSource(sourceName)
    }


    /**
     * Records a failed matching for inclusion in the fusion report.
     * Called when form creation fails (excessive candidates or runtime error).
     */
    private trackFailedMatching(fusionAccount: FusionAccount, error: string): void {
        this.log.error(`Failed matching for account ${fusionAccount.name} [${fusionAccount.sourceName}]: ${error}`)
        if (this.shouldCaptureManagedAccountReportData()) {
            this.tracker.failedMatchingAccounts.push({
                ...buildMinimalFusionReportAccount(
                    fusionAccount,
                    this.urlContext,
                    this.sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                    this.reportAttributes,
                    error,
                    this.resolveReportAccountId(fusionAccount)
                ),
                fusionIdentityComparisons: this.tracker.fusionIdentityComparisonsByAccount.get(fusionAccount) ?? 0,
            })
        }
    }

    /**
     * Removes an account from match reporting when the account was assigned automatically.
     * This prevents "manual review" report sections from showing resolved perfect matches.
     */
    private removeMatchAccount(managedAccountId?: string): void {
        if (!managedAccountId) return
        const idx = this.tracker.matchAccounts.findIndex((x) => x.managedAccountId === managedAccountId)
        if (idx !== -1) this.tracker.matchAccounts.splice(idx, 1)
    }

    /**
     * Reports should link to the ISC account id (not managed key).
     * Prefers the account's stored ISC id; falls back to source cache lookup.
     */
    private resolveReportAccountId(fusionAccount: FusionAccount): string | undefined {
        const iscId = fusionAccount.iscAccountId
        if (iscId) return iscId
        const managedKey = fusionAccount.managedAccountId
        if (!managedKey) return undefined
        return this.sources.resolveIscAccountIdForManagedKey(managedKey)
    }

    /**
     * Report links should prefer ISC account id. Inputs may already be ISC ids or managed keys.
     * Returns undefined if the account can't be resolved to an ISC id.
     */
    private resolveReportAccountIdValue(accountId?: string): string | undefined {
        if (!accountId) return undefined
        return this.sources.resolveIscAccountIdForManagedKey(accountId)
    }

    // ------------------------------------------------------------------------
    // Public Cleanup Methods
    // ------------------------------------------------------------------------

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
        const allAccounts = [...this.fusionAccountMap.values(), ...this.fusionIdentityMap.values()]
        const eligible = this.deleteEmpty ? allAccounts.filter((account) => !account.isOrphan()) : allAccounts

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
    public async forEachISCAccount(
        send: (account: StdAccountListOutput) => void
    ): Promise<{ sent: number; eligible: number }> {
        const batchSize = getFusionParallelBatchSize(this.config)
        let count = 0

        const allAccounts = [...this.fusionAccountMap.values(), ...this.fusionIdentityMap.values()]
        const eligibleAccounts = this.deleteEmpty ? allAccounts.filter((account) => !account.isOrphan()) : allAccounts

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

        if (!this.setCoreSchemaAttributes(fusionAccount)) {
            return undefined
        }

        const attributes = this.schemas.getFusionAttributeSubset(fusionAccount.attributes)
        const disabled = fusionAccount.disabled

        return {
            key: fusionAccount.key,
            attributes,
            disabled,
        }
    }

    // ------------------------------------------------------------------------
    // Private Helper Methods
    // ------------------------------------------------------------------------

    /**
     * Enforce display attribute overrides and generate/assign a key for interim accounts.
     * Returns true when the account is ready for output, false when it should be skipped.
     */
    private setCoreSchemaAttributes(fusionAccount: FusionAccount): boolean {
        // Enforce hosting identity name display override if correlated
        this.attributes.applyDisplayAttributeOverride(fusionAccount)

        // Generate and assign key for interim accounts (key postponed from processIdentity/processFusionIdentityDecision)
        const key = fusionAccount.key ?? this.attributes.getSimpleKey(fusionAccount)
        if (!key) {
            return false
        }
        if (!fusionAccount.key) {
            fusionAccount.setKey(key)
        }
        return true
    }

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
            fusionAccount.addStatus(StatusEntitlement.Candidate)
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
     * falling back to a linear scan of fusionAccountMap + identity-linked Fusion account map for standalone calls.
     */
    private isCorrelatedManagedAccountLinkedInFusion(account: Account): boolean {
        const key = getManagedAccountKeyFromAccount(account)
        if (key) {
            const index = this._linkedAccountKeyIndex
            if (index) {
                if (index.has(key)) return true
            } else {
                const isLinked = [...this.fusionAccountMap.values(), ...this.fusionIdentityMap.values()].some(
                    (fa) => fa.accountIdsSet.has(key) || fa.missingAccountIdsSet.has(key)
                )
                if (isLinked) return true
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
        await this.correlationManager.applyPerSourceCorrelationIfNeeded(fusionAccount)
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
    public shouldPruneDeletedManagedAccounts(): boolean {
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
    public async initializeSourceReviewers(): Promise<void> {
        this.sourcesByName = new Map(this.sources.managedSources.map((source) => [source.name, source]))

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
    public async preProcessManagedAccount(account: Account): Promise<FusionAccount> {
        const fusionAccount = FusionAccount.fromManagedAccount(account)
        this.log.debug(`Pre-processing managed account: ${account.name} [${account.sourceName}]`)

        await this.applyAttributeProcessing(fusionAccount)

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
    public *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
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

        this._managedAccountProcessingBatchSize = Math.max(1, getManagedAccountsBatchSize(this.config))
        this._managedAccountProcessingStartedAt = Date.now()

        this.tracker.newManagedAccountsCount = map.size
        this.currentRunUnmatchedFusionNativeIdentitiesBySource.clear()
        this.autoAssignedIdentityIds.clear()
        this.currentRunMatchScoringMs = 0

        for (const fusionAccount of this.fusionAccountMap.values()) {
            this.registerCurrentRunUnmatchedCandidate(fusionAccount)
        }

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
    public setFusionAccount(fusionAccount: FusionAccount): void {
        this._repository.setFusionAccount(fusionAccount, this._tracker)
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
     * After generating the report, this method clears the tracker to free memory.
     *
     * @param tracker - The AggregationTracker instance to build the report from
     * @param includeNonMatches - When true, append per-account rows for managed non-matches (e.g. custom:dryrun). Email reports omit these.
     * @param stats - Optional processing statistics to include in the report
     * @returns Complete fusion report with match/non-match accounts
     */
    public generateReport(
        tracker: AggregationTracker,
        includeNonMatches: boolean = false,
        stats?: FusionReportStats
    ): FusionReport {
        const report = buildFusionReport(
            {
                conflictingFusionIdentityAccounts: tracker.conflictingFusionIdentityAccounts,
                matchAccounts: tracker.matchAccounts,
                failedMatchingAccounts: tracker.failedMatchingAccounts,
                deferredMatchReportData: tracker.deferredMatchReportData,
                analyzedNonMatchReportData: tracker.analyzedNonMatchReportData,
                newManagedAccountsCount: tracker.newManagedAccountsCount,
                urlContext: this.urlContext,
                sourcesByName: this.sourcesByName,
                reportAttributes: this.reportAttributes,
                fusionIdentityComparisonsByAccount: tracker.fusionIdentityComparisonsByAccount,
                resolveReportAccountId: (account) => this.resolveReportAccountId(account),
                fusionAutoAssignmentScore: this.config.fusionAutoAssignmentScore,
            },
            includeNonMatches,
            stats
        )

        tracker.clear()

        return report
    }
}
