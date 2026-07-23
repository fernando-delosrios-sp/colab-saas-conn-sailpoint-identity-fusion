import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { StdAccountListOutput, StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { FormService } from '../formService'
import { IdentityService } from '../identityService'
import { SourceService } from '../sourceService'
import { FusionAccount } from '../../model/account'
import { MappingService } from '../mappingService'
import { DefinitionService } from '../definitionService'
import { MatchingService } from '../matchingService'
import { MatchCandidateType, FusionMatch } from '../matchingService/types'
import {
    hasIdentityCandidateMatches as checkHasIdentityCandidateMatches,
    hasDeferredCandidateMatches as checkHasDeferredCandidateMatches,
    formatFusionMatchDiscoveryLog,
} from '../matchingService/matchingHelpers'
import { assert } from '../../utils/assert'
import { createUrlContext, UrlContext } from '../../utils/url'
import { forEachBatched, compact } from './collections'
import { FusionDecision } from '../../model/form'
import { SchemaService } from '../schemaService'
import { FusionReport, FusionReportAccount as _FusionReportAccount, FusionReportStats } from './types'
import { FusionReportBlend } from '../../model/fusionReportBlend'
import {
    batchProcess,
    getManagedAccountsBatchSize,
    getManagedAccountEventLoopYieldEvery,
    getFusionParallelBatchSize,
} from './collections'
import { yieldToEventLoop } from '../../utils/yieldToEventLoop'
import { buildFusionReport } from './fusionReportBuilder'
import { resolveReportAccountId as resolveReportAccountIdFn, resolveReportAccountIdValue as resolveReportAccountIdValueFn } from './reportAccountResolver'
import { ManagedAccountAnalysisRecorder } from './managedAccountAnalysisRecorder'
import { AggregationTracker } from './aggregationTracker'

import { AttributeOperations } from '../definitionService/types'
import { getManagedAccountKeyFromAccount, normalizeCompositeManagedAccountKey } from '../../model/managedAccountKey'
import { StatusEntitlement } from '../../model/statusEntitlement'
import { hasValue, trimStr } from '../../utils/safeRead'
import { IdentityProcessor } from './identityProcessor'
import { CorrelationManager } from '../correlationManager'
import { DecisionProcessor } from './decisionProcessor'
import { MatchOutcomeDispatcher } from '../matchingService/matchOutcomeDispatcher'
import { AccountAssembly } from '../accountAssembly'
import { FusionRun } from '../../model/fusionRun'

// ============================================================================
// FusionService Class
// ============================================================================

/**
 * Service for identity fusion logic.
 * Pure in-memory operations - no ClientService dependency.
 * All data structures are passed in as parameters.
 */
export class FusionService {
    private identityProcessor: IdentityProcessor
    public correlationManager: CorrelationManager
    public decisionProcessor: DecisionProcessor
    public matchOutcomeDispatcher!: MatchOutcomeDispatcher
    public accountAssembly: AccountAssembly

    private get dispatcher(): MatchOutcomeDispatcher {
        assert(this.matchOutcomeDispatcher, 'MatchOutcomeDispatcher has not been wired to FusionService')
        return this.matchOutcomeDispatcher
    }

    private readonly reset: boolean
    private readonly reportAttributes: string[]
    public readonly urlContext: UrlContext
    private readonly deleteEmpty: boolean
    /** Cached set of configured source names — built once in the constructor (config is immutable). */
    public readonly configSourceNames: Set<string>
    public readonly fusionOwnerIsGlobalReviewer: boolean
    public readonly fusionReportOnAggregation: boolean
    public readonly commandType?: StandardCommand
    /** When true, report data should be captured even during aggregation (e.g. custom:dryrun). */
    private readonly shouldCaptureReportData: boolean
    /** Runtime flag set by setupPhase — when false, correlation-on-aggregation is suppressed. */
    private _isPersistentRun = true

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /**
     * @param config - Fusion configuration
     * @param log - Logger instance
     * @param identities - Identity service for identity lookups and correlation
     * @param sources - Source service for accessing source accounts and config
     * @param forms - Form service for creating and managing review forms
     * @param mappingService - Map service for attribute mapping from source accounts
     * @param definitionService - Define service for attribute definition and generation
     * @param matchingService - Match service for identity matching and scoring
     * @param schemas - Schema service for attribute schema lookups
     * @param commandType - The current SDK command type (e.g. StdAccountList)
     * @param shouldCaptureReportData - When true, report data is captured even during aggregation (e.g. custom:dryrun)
     */
    constructor(
        public config: FusionConfig,
        public log: LogService,
        public identities: IdentityService,
        public sources: SourceService,
        public forms: FormService,
        private mappingService: MappingService,
        private definitionService: DefinitionService,
        public matchingService: MatchingService,
        public schemas: SchemaService,
        public run: FusionRun,
        commandType?: StandardCommand,
        shouldCaptureReportData?: boolean,
        isAggregationMode?: boolean
    ) {
        FusionAccount.configure(config)
        this.configSourceNames = new Set(config.sources.map((s) => s.name))
        this.accountAssembly = new AccountAssembly({
            run: this.run,
            sources: this.sources,
            mappingService: this.mappingService,
            definitionService: this.definitionService,
            log: this.log,
            config: this.config,
            commandType,
            isAggregationMode: isAggregationMode ?? false,
            buildFusionBlend: (fa, account) => this.buildFusionBlend(fa, account),
            getTracker: () => this.run.getTracker(),
        })
        this.correlationManager = new CorrelationManager(
            config,
            log,
            this.sources,
            this.identities,
            () => this.accountAssembly.isAggregationAccountListMode(),
            () => this._isPersistentRun
        )
        this.identityProcessor = new IdentityProcessor(
            config,
            log,
            this.run,
            {
                identities: this.identities,
                configSourceNames: this.configSourceNames,
                accountAssembly: this.accountAssembly,
                getTracker: () => this.run.getTracker(),
            }
        )
        this.decisionProcessor = new DecisionProcessor(
            config,
            log,
            this.run,
            {
                forms: this.forms,
                identities: this.identities,
                correlationManager: this.correlationManager,
                definitionService: this.definitionService,
                accountAssembly: this.accountAssembly,
            }
        )
        this.reset = config.reset
        this.fusionOwnerIsGlobalReviewer = config.fusionOwnerIsGlobalReviewer ?? false
        this.fusionReportOnAggregation = config.fusionReportOnAggregation ?? false
        this.reportAttributes = config.fusionFormAttributes ?? []
        this.urlContext = createUrlContext(config.baseurl)
        this.run.analysisRecorder = new ManagedAccountAnalysisRecorder({
            log: this.log,
            tracker: () => this.tracker,
            urlContext: this.urlContext,
            reportAttributes: this.reportAttributes,
            sourcesByName: this.run.sourcesByName,
            config: this.config,
            sources: this.sources,
            shouldCaptureReportData: () => this.shouldCaptureManagedAccountReportData(),
        })
        this.commandType = commandType
        this.shouldCaptureReportData = shouldCaptureReportData ?? false
        this.run.setDisableOperationFactory(async (account) => {
            if (!this.accountAssembly.isAggregationAccountListMode()) {
                return
            }
            try {
                await this.fireDisableOperation(account)
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                this.log.warn(
                    `Disable operation failed for account ${account.name} [${account.sourceName}]: ${message}`
                )
            }
        })
        this.deleteEmpty = config.deleteEmpty
    }

    /**
     * Runs the provided function over items in bounded concurrent batches, logging progress.
     * Kept on FusionService so external callers (e.g. DecisionProcessor) do not need to
     * import batching utilities directly.
     */

    /**
     * Populate match / deferred / non-match report slices during managed-account analysis.
     * SDKs may report `commandType` as account list for custom commands; `custom:dryrun` must still capture slices.
     */
    private shouldCaptureManagedAccountReportData(): boolean {
        return (
            this.fusionReportOnAggregation ||
            !this.accountAssembly.isAggregationAccountListMode() ||
            this.shouldCaptureReportData
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
     * Retrieves a Fusion identity from the in-memory map by ISC identity ID.
     * A Fusion identity is a Fusion account that became an identity.
     *
     * @param identityId - The ISC identity ID to look up
     * @returns The Fusion account for this identity, or undefined if not found
     */
    public getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.run.getFusionIdentity(identityId)
    }

    /**
     * Sets the AggregationTracker instance to record report state.
     */
    public setTracker(tracker: AggregationTracker): void {
        this.run.setTracker(tracker)
    }

    /**
     * Sets whether the run is persistent (true) or non-persistent (dry-run, report context).
     * When false, correlation-on-aggregation is suppressed in CorrelationManager.
     */
    public setPersistentRun(isPersistent: boolean): void {
        this._isPersistentRun = isPersistent
    }

    /**
     * Retrieves the AggregationTracker instance.
     */
    public get tracker(): AggregationTracker {
        const t = this.run.getTracker()
        this.log.assert(!!t, 'AggregationTracker has not been set on FusionRun')
        if (!t) {
            this.log.crash('AggregationTracker has not been set on FusionRun')
        }
        return t!
    }

    /** Helper getters for stats that delegate to tracker if available */
    public get newManagedAccountsCount(): number {
        return this.run.getTracker()?.newManagedAccountsCount ?? 0
    }

    public get identitiesProcessedCount(): number {
        return this.run.getTracker()?.identitiesProcessedCount ?? 0
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
     * work queue (this.run.managedAccountsById). As accounts are matched, they're
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
        const results = await batchProcess(fusionAccounts, 'Fusion accounts', async (x: Account) => {
            return await this.processFusionAccount(x)
        }, this.config, this.log)
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
     *    entries (which may reference accounts not present in this run) and
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
        await batchProcess(
            allAccounts,
            'Unique-attribute generation',
            (account) => this.definitionService.refreshUniqueAttributes(account),
            this.config,
            this.log,
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
     * addManagedAccountLayer receives the direct reference to this.run.managedAccountsById,
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
            `Pre-processing fusion account: ${fusionAccount.name} (${fusionAccount.managedKey}), ` +
                `identityId=${fusionAccount.identityId ?? 'none'}, disabled=${fusionAccount.disabled}, uncorrelated=${fusionAccount.uncorrelated}`
        )

        assert(this.run.managedAccountsById, 'Managed accounts have not been loaded')

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
        // do not append the generic "Blended managed account …" for that same managed key
        // (persisted accounts list can lag identity until the next account write).
        let skipBlendHistoryForManagedKeys: ReadonlySet<string> | undefined
        if (authorizedLinkDecision) {
            const rawKey = trimStr(authorizedLinkDecision.account.id) ?? ''
            const normalized = normalizeCompositeManagedAccountKey(rawKey)
            if (normalized) {
                skipBlendHistoryForManagedKeys = new Set([normalized])
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
        await this.accountAssembly.addManagedAccountLayer(fusionAccount, {
            addBlendHistory: true,
            skipBlendHistoryForManagedKeys,
        })

        await yieldToEventLoop()

        if (!resetDefinition) {
            await this.definitionService.registerUniqueAttributes(fusionAccount)
        }

        fusionAccount.setNeedsRefresh(
            fusionAccount.needsRefresh || refreshDefinition || refreshMapping || this.config.forceAttributeRefresh
        )
        fusionAccount.setNeedsReset(resetDefinition)

        await this.accountAssembly.applyAttributeProcessing(fusionAccount)

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

        this.accountAssembly.registerFusionAccount(fusionAccount)

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
        const results = await this.identityProcessor.processIdentities()
        await this.initializeSourceReviewers()
        return results
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
     * At this point, the work queue (this.run.managedAccountsById) contains ONLY
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
        this.run.sourcesWithoutReviewers.clear()
        for (const source of this.sources.managedSources) {
            const reviewers = this.run.reviewersBySourceId.get(source.id)
            if (!reviewers || reviewers.size === 0) {
                this.run.sourcesWithoutReviewers.add(source.name)
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
        this.run.initLinkedAccountIndex()
        for (const fa of this.run.allFusionAccounts) {
            for (const key of fa.accountIdsSet) this.run.addToLinkedAccountIndex(key)
            for (const key of fa.missingAccountIdsSet) this.run.addToLinkedAccountIndex(key)
        }
        for (const fa of this.run.allFusionIdentities) {
            for (const key of fa.accountIdsSet) this.run.addToLinkedAccountIndex(key)
            for (const key of fa.missingAccountIdsSet) this.run.addToLinkedAccountIndex(key)
        }
    }

    private async runCorrelatedAccountSweep(map: Map<string, Account>): Promise<void> {
        // Correlated account sweep: resolve all correlated managed accounts before uncorrelated scoring begins.
        // Orphan correlated accounts (correlated on the source but absent from any loaded Fusion row)
        // are registered as non-matches in the identity-linked Fusion account map here, so they are immediately visible
        // as deferred-match candidates when uncorrelated accounts are scored in the uncorrelated scoring sweep.
        const correlatedAccounts = [...map.values()].filter((a) => a.uncorrelated === false)
        if (correlatedAccounts.length === 0) {
            return
        }

        this.log.info(
            `Correlated account sweep: resolving ${correlatedAccounts.length} correlated managed account(s) before uncorrelated scoring`
        )
        await batchProcess(
            correlatedAccounts,
            'Correlated managed accounts',
            (account) => this.processManagedAccount(account),
            this.config,
            this.log,
            this.run.managedAccountProcessingBatchSize
        )
        this.log.info(`Correlated account sweep complete: ${map.size} uncorrelated account(s) queued for scoring`)
    }

    /**
     * Uncorrelated scoring sweep: drains the remaining uncorrelated managed-account queue after the
     * correlated account sweep has claimed linked/correlated entries.
     */
    private async runUncorrelatedManagedAccountSweep(
        queuedAccounts: Account[],
        batchSize: number,
        _managedAccountProcessingStartedAt: number
    ): Promise<number> {
        const result = await this.dispatcher.runMatchSweep(queuedAccounts, batchSize)
        return result.processed
    }

    /**
     * Wait for all pending asynchronous disable operations to complete.
     * Safe to call multiple times; it drains the current pending set.
     */
    public async awaitPendingDisableOperations(): Promise<void> {
        if (this.run.pendingDisableOperationsCount === 0) {
            return
        }

        this.log.info(`Waiting for ${this.run.pendingDisableOperationsCount} pending disable operation(s)`)
        await this.run.awaitPendingDisableOperations()
        this.log.info('Pending disable operations completed')
    }

    /**
     * Processes a single managed account through the Match workflow (or a correlated
     * orphan shortcut when the account is correlated on the source but not linked to
     * any loaded Fusion row).
     * After scoring, the account is either assigned automatically to the matched identity
     * (perfect scores when enabled), sent for manual review (partial match), or handled
     * based on the source type:
     * - authoritative: added as non-matched new identity (output as ISC account)
     * - record: unique attributes registered but not output as ISC account
     * - orphan: dropped immediately; optionally fires a disable operation
     *
     * @param account - The ISC account from a managed source (typically uncorrelated on the work queue)
     * @returns The fusion account produced or updated, or undefined if skipped or sent for manual review.
     *          Deferred candidate matches (deferred candidate is another provisional Fusion account from the same source) are removed from
     *          the managed-account work queue for this run; they are expected to be re-fetched next aggregation.
     */
    /**
     * Processes a single managed account through the Match workflow.
     * Delegates scoring, resolution, and outcome dispatch to {@link MatchOutcomeDispatcher}.
     */
    public async processManagedAccount(account: Account): Promise<FusionAccount | undefined> {
        const result = await this.dispatcher.runMatchSweep([account], 1)
        return result.resolved[0]?.fusionAccount
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
        const map = this.run.managedAccountsById
        assert(map, 'Managed accounts have not been loaded')
        this.run.matchScoringMs = 0
        const results: FusionAccount[] = []

        const accounts = [...map.values()]
        const sweepResult = await this.dispatcher.runMatchSweep(
            accounts,
            this.run.managedAccountProcessingBatchSize || 1,
            { analysisOnly: true }
        )

        let processed = 0
        const yieldEveryManaged = getManagedAccountEventLoopYieldEvery(this.config)
        for (const resolved of sweepResult.resolved) {
            const analysis = resolved.analysis!
            this.run.analysisRecorder!.recordAnalysis(analysis)
            const { fusionAccount, account } = analysis
            if (
                fusionAccount.isMatch &&
                !checkHasIdentityCandidateMatches(fusionAccount) &&
                checkHasDeferredCandidateMatches(fusionAccount)
            ) {
                const deferredMatches = fusionAccount.fusionMatches.filter(
                    (m: FusionMatch) => m.candidateType === MatchCandidateType.Deferred
                )
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
     * Reports should link to the ISC account id (not managed key).
     * Prefers the account's stored ISC id; falls back to source cache lookup.
     */
    private resolveReportAccountId(fusionAccount: FusionAccount): string | undefined {
        return resolveReportAccountIdFn(fusionAccount, this.sources)
    }

    /**
     * Report links should prefer ISC account id. Inputs may already be ISC ids or managed keys.
     * Returns undefined if the account can't be resolved to an ISC id.
     */
    private resolveReportAccountIdValue(accountId?: string): string | undefined {
        return resolveReportAccountIdValueFn(accountId, this.sources)
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
        const allAccounts = [...this.run.allFusionAccounts, ...this.run.allFusionIdentities]
        const eligible = this.deleteEmpty ? allAccounts.filter((account) => !account.isOrphan()) : allAccounts

        const results = await batchProcess(eligible, 'ISC accounts', (x) => this.getISCAccount(x), this.config, this.log)
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
        send: (account: StdAccountListOutput) => void,
        refreshUniqueAttributes: boolean = false
    ): Promise<{ sent: number; eligible: number }> {
        const batchSize = getFusionParallelBatchSize(this.config)
        let count = 0

        const allAccounts = [...this.run.allFusionAccounts, ...this.run.allFusionIdentities]
        const eligibleAccounts = this.deleteEmpty ? allAccounts.filter((account) => !account.isOrphan()) : allAccounts

        const totalEligible = eligibleAccounts.length
        const totalBatches = Math.ceil(totalEligible / batchSize)
        const logProgressEveryBatch = Math.max(1, Math.min(50, Math.ceil(totalBatches / 20) || 1))
        for (let i = 0; i < eligibleAccounts.length; i += batchSize) {
            const batch = eligibleAccounts.slice(i, i + batchSize)
            const outputBatch = await Promise.all(
                batch.map(async (account) => {
                    if (refreshUniqueAttributes && account.needsRefresh) {
                        await this.definitionService.refreshUniqueAttributes(account)
                    }
                    return this.getISCAccount(account, false)
                })
            )
            for (let j = 0; j < outputBatch.length; j++) {
                const output = outputBatch[j]
                if (output) {
                    send(output)
                    count++
                }
                this.run.removeFusionAccount(batch[j])
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
     * Key / managedKey handling:
     * - The output key is always `key.simple.id = fusionAccount.managedKey`.
     * - The managedKey is set by the factory method and never changed afterwards.
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
        this.definitionService.applyDisplayAttributeOverride(fusionAccount)

        // Generate and assign key for interim accounts (key postponed from processIdentity/processFusionIdentityDecision)
        const key = fusionAccount.key ?? this.definitionService.getSimpleKey(fusionAccount)
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

        const pendingCandidates = this.run.pendingCandidateIdentityIds
        const needsCandidate = pendingCandidates.has(identityId)
        if (needsCandidate) {
            fusionAccount.addStatus(StatusEntitlement.Candidate)
        }

        if (fusionAccount.listReviewerSources().length > 0) {
            const reviewerUrls = this.run.getReviewerUrls(identityId)
            if (reviewerUrls?.length) {
                for (const u of reviewerUrls) {
                    fusionAccount.addFusionReview(u)
                }
            }
        }
    }

    /**
     * True when this managed account is already represented on a loaded Fusion account
     * (platform Fusion row or identity-origin Fusion row), or when its identityId matches
     * a loaded identity-origin Fusion account.
     *
     * Uses _linkedAccountKeyIndex (O(1)) when available (set by the correlated account sweep),
     * falling back to a linear scan of fusionAccountMap + identity-linked Fusion account map for standalone calls.
     */
    private isCorrelatedManagedAccountLinkedInFusion(account: Account): boolean {
        const key = getManagedAccountKeyFromAccount(account)
        if (key) {
            const index = this.run.linkedAccountKeyIndex
            if (index) {
                if (index.has(key)) return true
            } else {
                const isLinked = [...this.run.allFusionAccounts, ...this.run.allFusionIdentities].some(
                    (fa) => fa.accountIdsSet.has(key) || fa.missingAccountIdsSet.has(key)
                )
                if (isLinked) return true
            }
        }
        const identityId = account.identityId
        if (hasValue(identityId) && this.run.hasFusionIdentity(identityId)) {
            return true
        }
        return false
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
     * Set a reviewer for a specific source.
     *
     * @param fusionAccount - The fusion account to set as reviewer
     * @param sourceId - The source ID to associate the reviewer with
     */
    private setReviewerForSource(fusionAccount: FusionAccount, sourceId: string): void {
        this.log.debug(`Setting reviewer for ${fusionAccount.name} -> sourceId=${sourceId}`)
        fusionAccount.setSourceReviewer(sourceId)
        const reviewers: Set<FusionAccount> = this.run.reviewersBySourceId.get(sourceId) ?? new Set()
        reviewers.add(fusionAccount)
        this.run.reviewersBySourceId.set(sourceId, reviewers)
    }

    /**
     * Populate a reviewer's fusion reviews from pending (unanswered) form instances.
     * Clears existing reviews so only current-run pending URLs are included.
     */
    private populateReviewerFusionReviewsFromPending(reviewer: FusionAccount): void {
        reviewer.clearFusionReviews()
        const identityId = reviewer.identityId
        if (!identityId) return
        const urls = this.run.getReviewerUrls(identityId)
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
                this.run.sourcesByName.clear()
        for (const source of this.sources.managedSources) {
            this.run.sourcesByName.set(source.name, source)
        }

        if (!this.fusionOwnerIsGlobalReviewer) {
            return
        }

        const globalOwnerIds = await this.sources.fetchGlobalOwnerIdentityIds()
        for (const reviewerId of globalOwnerIds) {
            const reviewer = this.run.getFusionIdentity(reviewerId)
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
        return this.accountAssembly.assembleManagedAccount(account)
    }

    /**
     * Returns an iterable over fusion identity accounts.
     * Avoids creating a temporary array when only iteration is needed (e.g. scoring).
     */
    public get fusionIdentities(): Iterable<FusionAccount> {
        return this.run.allFusionIdentities
    }

    /**
     * Returns an iterable over fusion identities, skipping those whose identityId is in `excludeIds`.
     * Used to filter already auto-assigned identities during managed account scoring.
     */
    public *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
        for (const identity of this.run.allFusionIdentities) {
            if (!identity.identityId || !excludeIds.has(identity.identityId)) {
                yield identity
            }
        }
    }

    /**
     * Get all fusion accounts keyed by managedKey as an array.
     * Note: Creates a new array on each access.
     */
    public get fusionAccounts(): FusionAccount[] {
        return this.run.allFusionAccounts
    }

    /** Total number of fusion accounts (correlated identities + uncorrelated accounts) */
    public get totalFusionAccountCount(): number {
        return this.run.totalFusionAccountCount
    }

    /** Get reviewers by source ID map */
    public get reviewersBySourceId(): Map<string, Set<FusionAccount>> {
        return this.run.reviewersBySourceId
    }

    private ensureManagedAccountProcessingInitialized(): void {
        if (this.run.managedAccountProcessingState !== 'initialized') {
            throw new Error('initializeManagedAccountProcessing must be called before managed account processing')
        }
    }

    /** Initialize managed account processing state: rebuilt trigram index, linked account key index, and reviewer validation. */
    public async initializeManagedAccountProcessing(): Promise<void> {
        if (this.run.managedAccountProcessingState !== 'idle') {
            throw new Error('Managed account processing already initialized')
        }
        const map = this.run.managedAccountsById
        assert(map, 'Managed accounts have not been loaded')

        this.run.startManagedAccountProcessing(Math.max(1, getManagedAccountsBatchSize(this.config)))

        this.tracker.newManagedAccountsCount = map.size
        this.run.clearDeferredCandidates()
        this.run.resetScoringState()

        for (const fusionAccount of this.run.fusionAccountMap.values()) {
            this.run.registerDeferredCandidate(fusionAccount)
        }

        this.validateManagedSourceReviewers()

        // Build the trigram blocking index over all currently-loaded fusion identities so that
        // each managed account can skip the vast majority of identity comparisons.
        // The index is rebuilt each run (identity pool may change between runs).
        this.matchingService.buildTrigramIndex(this.fusionIdentities)

        this.buildLinkedAccountKeyIndex()
    }

    /** Correlated account sweep: resolve linked/correlated managed accounts before uncorrelated scoring. */
    public async processCorrelatedManagedAccounts(): Promise<void> {
        this.ensureManagedAccountProcessingInitialized()
        const map = this.run.managedAccountsById
        await this.runCorrelatedAccountSweep(map)
        this.run.clearLinkedAccountIndex()
    }

    /**
     * Uncorrelated scoring sweep: drain remaining work-queue entries after the correlated account sweep.
     * @returns Processed count and match scoring duration for metric emission.
     */
    public async processUncorrelatedManagedAccounts(): Promise<{ processed: number; matchScoringMs: number }> {
        this.ensureManagedAccountProcessingInitialized()
        const map = this.run.managedAccountsById
        const queuedAccounts = [...map.values()]
        const initialQueueSize = queuedAccounts.length
        this.log.info(
            `Processing ${initialQueueSize} managed account(s): analyzing uncorrelated work-queue entries (matching and scoring vs identities)`
        )
        const processed = await this.runUncorrelatedManagedAccountSweep(
            queuedAccounts,
            this.run.managedAccountProcessingBatchSize,
            this.run.managedAccountProcessingBatchSize
        )
        this.run.resetManagedAccountProcessing()
        return { processed, matchScoringMs: this.run.matchScoringMs }
    }

    /**
     * Records conflicting correlated Fusion accounts and logs warning guidance.
     */
    public setFusionAccount(fusionAccount: FusionAccount): void {
        this.accountAssembly.registerFusionAccount(fusionAccount)
    }

    public buildFusionBlend(fusionAccount: FusionAccount, account: Account): FusionReportBlend {
        const sourceName = account.sourceName ?? ''
        const nativeIdentity = trimStr(account.nativeIdentity) ?? ''
        const blendedAccountName = trimStr(account.name) || nativeIdentity || account.id || ''
        return {
            accountName: fusionAccount.name ?? fusionAccount.identityId ?? 'Unknown',
            accountUrl: fusionAccount.identityId ? this.urlContext.identity(fusionAccount.identityId) : undefined,
            blendedAccountName,
            blendedSource: sourceName,
        }
    }

    /**
     * Retrieves a fusion account by its managedKey (unique key).
     *
     * @param managedKey - The managedKey string to look up
     * @returns The fusion account, or undefined if not found
     */
    public getFusionAccountByManagedKey(managedKey: string): FusionAccount | undefined {
        return this.run.getFusionAccountByManagedKey(managedKey)
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
                sourcesByName: this.run.sourcesByName,
                reportAttributes: this.reportAttributes,
                fusionIdentityComparisonsByAccount: tracker.fusionIdentityComparisonsByAccount,
                sources: this.sources,
                fusionAutoAssignmentScore: this.config.fusionAutoAssignmentScore,
            },
            includeNonMatches,
            stats
        )

        if (tracker.fusionBlends.length > 0) {
            report.fusionBlends = [...tracker.fusionBlends]
        }

        tracker.clear()

        return report
    }
}
