import { AccountV2025 as Account } from 'sailpoint-api-client'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceType } from '../../model/config'
import { FusionAccount } from '../../model/account'
import { FusionDecision } from '../../model/form'
import { FusionRun } from '../../model/fusionRun'
import { LogService } from '../logService'
import { SourceInfo } from '../sourceService'
import { FormService } from '../formService'
import { MatchingService, COMBINED_SCORE_ROW_ATTRIBUTE } from './matchingService'
import {
    formatFusionMatchDiscoveryLog,
    anchorDeferredMatches,
    hasActionableDeferredAnchorMatch,
    hasDeferredCandidateMatches,
    isDeferredMatchingEnabledForSource,
    isRecordMatchingEnabledForSource,
} from './matchingHelpers'
import { ManagedAccountAnalysisContext, ManagedAccountMatchingResult, MatchCandidateType } from './types'
import { AccountAssembly } from '../accountAssembly'
import { CorrelationManager } from '../correlationManager'
import { DefinitionService } from '../definitionService'
import { MappingService } from '../mappingService'
import { assert } from '../../utils/assert'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { isManagedAccountLinkedInFusion } from '../../model/managedAccountLink'
import { yieldToEventLoop } from '../../utils/yieldToEventLoop'
import { defaultFusionMaxCandidatesForForm } from '../../data/config'
import { promiseAllBatched, getScoringMaxConcurrency } from '../fusionService/collections'

/**
 * Narrow seam for the service that applies a FusionDecision to an identity.
 * MatchOutcomeDispatcher depends on this interface, not on a closure over FusionService.
 */
interface DecisionProcessor {
    processFusionIdentityDecision(decision: FusionDecision): Promise<FusionAccount | undefined>
}

// ============================================================================
// Public types
// ============================================================================

type MatchResolution = 'exact-match' | 'partial-match' | 'deferred-match' | 'non-match'

export interface ResolvedMatch {
    account: Account
    fusionAccount: FusionAccount
    resolution: MatchResolution
    identityId?: string
    /** Present when the sweep was requested in analysis-only mode. */
    analysis?: ManagedAccountAnalysisContext
}

export interface MatchSweepResult {
    processed: number
    matchScoringMs: number
    exact: number
    partial: number
    deferred: number
    nonMatch: number
    resolved: ResolvedMatch[]
}

// ============================================================================
// Scoring seam
// ============================================================================

interface ScoreManagedAccountsDeps {
    readonly config: FusionConfig
    readonly log: LogService
    readonly run: FusionRun
    readonly matchingService: MatchingService
    readonly accountAssembly: AccountAssembly
}

interface IdentityPhaseResult {
    identityResults: ManagedAccountMatchingResult[]
    pendingDeferred: ManagedAccountAnalysisContext[]
}

interface DeferredDrainDiag {
    poolQueries: number
    poolSizeTotal: number
    emptyPools: number
    deferredMatched: number
    nonMatch: number
}

/**
 * Identity-phase scoring for a batch of managed accounts (parallel batches permitted).
 * Does not register pending accounts in the deferred candidate pool.
 */
async function scoreIdentityPhase(
    accounts: Account[],
    batchSize: number,
    deps: ScoreManagedAccountsDeps
): Promise<IdentityPhaseResult> {
    const { config, log, run } = deps
    const identityResults: ManagedAccountMatchingResult[] = []
    const pendingDeferred: ManagedAccountAnalysisContext[] = []
    const maxCandidatesForForm = config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
    const scoringConcurrency = Math.max(1, Math.min(batchSize, getScoringMaxConcurrency(config)))
    const diag = { identityMatched: 0, deferredDisabled: 0, deferredPending: 0 }

    for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize)
        const identityAnalyses = await promiseAllBatched(
            batch,
            (account) => scoreIdentityCandidates(account, deps, maxCandidatesForForm),
            scoringConcurrency
        )
        for (let j = 0; j < identityAnalyses.length; j++) {
            const analysis = identityAnalyses[j]
            const account = batch[j]
            if (analysis.hasIdentityCandidateMatches) {
                diag.identityMatched++
                identityResults.push({ analysis, resolution: 'identity-match' })
            } else if (isDeferredMatchingEnabledForSource(account.sourceName ?? undefined, run.sourcesByName)) {
                diag.deferredPending++
                pendingDeferred.push(analysis)
            } else {
                diag.deferredDisabled++
                identityResults.push({ analysis, resolution: 'non-match' })
            }
        }
        await yieldToEventLoop()
    }

    log.info(
        `[deferred-diag] identityPhase scored=${accounts.length} identityMatched=${diag.identityMatched} ` +
            `deferredDisabled=${diag.deferredDisabled} deferredPending=${diag.deferredPending}`
    )

    return { identityResults, pendingDeferred }
}

async function scoreIdentityCandidates(
    account: Account,
    deps: ScoreManagedAccountsDeps,
    maxCandidatesForForm: number
): Promise<ManagedAccountAnalysisContext> {
    const { config, log, run, matchingService, accountAssembly } = deps
    const { name, sourceName } = account
    const fusionAccount = await accountAssembly.assembleManagedAccount(account)
    const sourceInfo = sourceName ? run.sourcesByName.get(sourceName) : undefined
    const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative
    const recordMatchingEnabled = isRecordMatchingEnabledForSource(sourceName ?? undefined, run.sourcesByName)
    let fusionIdentityComparisons = 0
    let hasIdentityCandidateMatches = false

    if (recordMatchingEnabled) {
        const excludeIds =
            config.fusionEnableAutoMerge && run.autoMergedIdentityIds.size > 0 ? run.autoMergedIdentityIds : undefined
        const candidateSet = matchingService.getCandidates(fusionAccount, log, excludeIds)
        const identityPool: Iterable<FusionAccount> =
            candidateSet ?? (excludeIds ? run.fusionIdentitiesExcluding(excludeIds) : run.allFusionIdentities)
        const scoringStarted = Date.now()
        fusionIdentityComparisons = await matchingService.scoreFusionAccount(
            fusionAccount,
            identityPool,
            MatchCandidateType.Identity,
            maxCandidatesForForm
        )
        run.matchScoringMs += Date.now() - scoringStarted
        hasIdentityCandidateMatches = hasIdentityCandidateMatchesFn(fusionAccount)
    } else {
        log.debug(
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
        hasIdentityCandidateMatches,
    }
}

async function scoreDeferredForAccount(
    analysis: ManagedAccountAnalysisContext,
    deps: ScoreManagedAccountsDeps,
    diag: DeferredDrainDiag,
    remainingInQueue: Map<string, ManagedAccountAnalysisContext>,
    materializedEarly: ReadonlySet<string>
): Promise<void> {
    const { run, matchingService } = deps
    const scoringStarted = Date.now()
    const selfKey = analysis.fusionAccount.managedKey
    const seen = new Set<string>()
    const pool: FusionAccount[] = []

    for (const candidate of run.currentRunDeferredCandidatesForSource(analysis.account.sourceName)) {
        const key = candidate.managedKey
        if (!key || key === selfKey || seen.has(key) || materializedEarly.has(key)) continue
        seen.add(key)
        pool.push(candidate)
    }

    for (const [key, pending] of remainingInQueue) {
        if (key === selfKey || seen.has(key) || materializedEarly.has(key)) continue
        seen.add(key)
        pool.push(pending.fusionAccount)
    }

    diag.poolSizeTotal += pool.length
    diag.poolQueries++
    if (pool.length === 0) diag.emptyPools++
    analysis.fusionIdentityComparisons += await matchingService.scoreFusionAccount(
        analysis.fusionAccount,
        pool,
        MatchCandidateType.Deferred
    )
    run.matchScoringMs += Date.now() - scoringStarted
}

/** Deterministic order within a single source: managedKey sort. */
function sortPendingByManagedKey(pending: ManagedAccountAnalysisContext[]): ManagedAccountAnalysisContext[] {
    return [...pending].sort((a, b) =>
        (a.fusionAccount.managedKey ?? '').localeCompare(b.fusionAccount.managedKey ?? '')
    )
}

function groupPendingBySource(pending: ManagedAccountAnalysisContext[]): Map<string, ManagedAccountAnalysisContext[]> {
    const groups = new Map<string, ManagedAccountAnalysisContext[]>()
    for (const analysis of pending) {
        const sourceKey = analysis.account.sourceName ?? ''
        const list = groups.get(sourceKey) ?? []
        list.push(analysis)
        groups.set(sourceKey, list)
    }
    for (const [sourceKey, list] of groups) {
        groups.set(sourceKey, sortPendingByManagedKey(list))
    }
    return groups
}

// ============================================================================
// Non-authoritative no-match helper
// ============================================================================

export interface ApplyNonAuthoritativeNoMatchDeps {
    readonly definitionService: DefinitionService
    readonly mappingService: MappingService
    readonly run: FusionRun
}

/**
 * Applies the record/orphan branch of a non-match outcome.
 * Returns true when the account was handled (record/orphan), false when the caller
 * should treat it as an authoritative non-match.
 */
export async function applyNonAuthoritativeNoMatch(
    fusionAccount: FusionAccount,
    sourceType: SourceType,
    sourceInfo: SourceInfo | undefined,
    account: Account | undefined,
    deps: ApplyNonAuthoritativeNoMatchDeps
): Promise<boolean> {
    if (sourceType === SourceType.Record) {
        if (account) {
            await deps.definitionService.registerUniqueValuesFromRecordManagedAccount(
                account,
                deps.mappingService,
                deps.run
            )
        } else {
            await deps.definitionService.registerUniqueAttributes(fusionAccount)
        }
        return true
    }
    if (sourceType === SourceType.Orphan) {
        if (sourceInfo?.config?.disableNonMatchingAccounts && account) {
            deps.run.queueDisableOperation(account)
        }
        return true
    }
    return false
}

// ============================================================================
// Match outcome dispatcher
// ============================================================================

export interface MatchOutcomeDispatcherDeps {
    readonly config: FusionConfig
    readonly log: LogService
    readonly run: FusionRun
    readonly matchingService: MatchingService
    readonly correlationManager: CorrelationManager
    readonly definitionService: DefinitionService
    readonly mappingService: MappingService
    readonly accountAssembly: AccountAssembly
    readonly forms: FormService
    readonly decisionProcessor: DecisionProcessor
    readonly commandType?: StandardCommand
}

/**
 * Owns the Match step for managed source accounts: scoring, resolution, and outcome dispatch.
 * Stateless with respect to run-scoped mutable data; all mutable state lives in {@link FusionRun}.
 */
export class MatchOutcomeDispatcher {
    constructor(private readonly deps: MatchOutcomeDispatcherDeps) {}

    private scoringDeps(): ScoreManagedAccountsDeps {
        return {
            config: this.deps.config,
            log: this.deps.log,
            run: this.deps.run,
            matchingService: this.deps.matchingService,
            accountAssembly: this.deps.accountAssembly,
        }
    }

    /**
     * Sequential deferred drain within one source; sources run concurrently via {@link runDeferredDrain}.
     * Each pending account is scored against finalized candidates plus remaining queue peers.
     */
    private async runDeferredDrainForSource(
        sorted: ManagedAccountAnalysisContext[],
        options?: { analysisOnly?: boolean }
    ): Promise<{ scored: ManagedAccountMatchingResult[]; resolved: ResolvedMatch[]; diag: DeferredDrainDiag }> {
        const remainingInQueue = new Map<string, ManagedAccountAnalysisContext>()
        for (const analysis of sorted) {
            const key = analysis.fusionAccount.managedKey
            if (key) remainingInQueue.set(key, analysis)
        }
        const materializedEarly = new Set<string>()
        const scored: ManagedAccountMatchingResult[] = []
        const resolved: ResolvedMatch[] = []
        const diag: DeferredDrainDiag = {
            poolQueries: 0,
            poolSizeTotal: 0,
            emptyPools: 0,
            deferredMatched: 0,
            nonMatch: 0,
        }
        const scoringDeps = this.scoringDeps()

        for (const analysis of sorted) {
            const key = analysis.fusionAccount.managedKey
            if (key && materializedEarly.has(key)) continue

            await scoreDeferredForAccount(analysis, scoringDeps, diag, remainingInQueue, materializedEarly)

            const resolution = options?.analysisOnly
                ? hasActionableDeferredAnchorMatch(analysis.fusionAccount, this.deps.run)
                    ? 'deferred-match'
                    : 'non-match'
                : hasDeferredCandidateMatches(analysis.fusionAccount)
                    ? 'deferred-match'
                    : 'non-match'
            const scoredResult: ManagedAccountMatchingResult = { analysis, resolution }
            scored.push(scoredResult)

            if (options?.analysisOnly) {
                if (this.deps.run.analysisRecorder) {
                    this.deps.run.analysisRecorder.recordAnalysis(analysis)
                }
                if (resolution === 'non-match') {
                    this.registerPoolAnchorForAnalysis(analysis.fusionAccount)
                }
                resolved.push({
                    account: analysis.account,
                    fusionAccount: analysis.fusionAccount,
                    resolution,
                    analysis,
                })
            } else {
                if (resolution === 'deferred-match') {
                    await this.handleDeferredMatch(
                        analysis.fusionAccount,
                        analysis.account,
                        remainingInQueue,
                        materializedEarly
                    )
                    if (this.deps.run.analysisRecorder) {
                        this.deps.run.analysisRecorder.recordAnalysis(analysis)
                    }
                    resolved.push({
                        account: analysis.account,
                        fusionAccount: analysis.fusionAccount,
                        resolution: 'deferred-match',
                    })
                } else {
                    const nonMatchAccount = await this.handleNonMatch(
                        analysis.fusionAccount,
                        analysis.account,
                        analysis.sourceType,
                        analysis.sourceInfo
                    )
                    if (this.deps.run.analysisRecorder) {
                        this.deps.run.analysisRecorder.recordAnalysis(analysis)
                    }
                    resolved.push({
                        account: analysis.account,
                        fusionAccount: nonMatchAccount ?? analysis.fusionAccount,
                        resolution: 'non-match',
                    })
                }
            }

            if (key) remainingInQueue.delete(key)
            if (resolution === 'deferred-match') diag.deferredMatched++
            else diag.nonMatch++
        }

        return { scored, resolved, diag }
    }

    /**
     * Deferred drain: sequential within each source, concurrent across sources.
     * Each source mutates only its own candidate pool bucket on FusionRun.
     */
    private async runDeferredDrain(
        pending: ManagedAccountAnalysisContext[],
        options?: { analysisOnly?: boolean }
    ): Promise<{ scored: ManagedAccountMatchingResult[]; resolved: ResolvedMatch[] }> {
        if (pending.length === 0) return { scored: [], resolved: [] }

        const bySource = groupPendingBySource(pending)
        const sourceResults = await Promise.all(
            Array.from(bySource.values()).map((sourcePending) =>
                this.runDeferredDrainForSource(sourcePending, options)
            )
        )

        const scored = sourceResults.flatMap((result) => result.scored)
        const resolved = sourceResults.flatMap((result) => result.resolved)
        const diag: DeferredDrainDiag = {
            poolQueries: 0,
            poolSizeTotal: 0,
            emptyPools: 0,
            deferredMatched: 0,
            nonMatch: 0,
        }
        for (const result of sourceResults) {
            diag.poolQueries += result.diag.poolQueries
            diag.poolSizeTotal += result.diag.poolSizeTotal
            diag.emptyPools += result.diag.emptyPools
            diag.deferredMatched += result.diag.deferredMatched
            diag.nonMatch += result.diag.nonMatch
        }

        this.deps.log.info(
            `[deferred-diag] drain pending=${pending.length} sources=${bySource.size} poolQueries=${diag.poolQueries} ` +
                `avgPoolSize=${diag.poolQueries > 0 ? (diag.poolSizeTotal / diag.poolQueries).toFixed(1) : 'n/a'} ` +
                `emptyPools=${diag.emptyPools} deferredMatched=${diag.deferredMatched} nonMatch=${diag.nonMatch}`
        )

        return { scored, resolved }
    }

    /** Updates the deferred pool during analysis-only scoring without registering fusion accounts. */
    private registerPoolAnchorForAnalysis(fusionAccount: FusionAccount): void {
        fusionAccount.setNonMatched()
        if (isDeferredMatchingEnabledForSource(fusionAccount.sourceName, this.deps.run.sourcesByName)) {
            this.deps.run.registerFinalizedDeferredCandidate(fusionAccount)
        }
    }

    /**
     * Scores the supplied accounts and dispatches each to one of the four Match outcomes.
     *
     * @param accounts - Managed source accounts to score and dispatch
     * @param batchSize - How many accounts to score concurrently within each phase
     * @param options - When `analysisOnly` is true, scoring runs but outcomes are not applied.
     * @returns A summary of processed accounts and their resolutions
     */
    public async runMatchSweep(
        accounts: Account[],
        batchSize: number,
        options?: { analysisOnly?: boolean }
    ): Promise<MatchSweepResult> {
        if (options?.analysisOnly) {
            return this.runAnalysisOnly(accounts, batchSize)
        }

        const { run, log, accountAssembly } = this.deps
        const result: MatchSweepResult = {
            processed: 0,
            matchScoringMs: run.matchScoringMs,
            exact: 0,
            partial: 0,
            deferred: 0,
            nonMatch: 0,
            resolved: [],
        }

        if (accounts.length === 0) {
            return result
        }

        const initialQueueSize = accounts.length
        let processedCount = 0
        const updateProgress = (): void => {
            log.setProgress(processedCount, initialQueueSize, 'analyzed')
        }

        interface PendingScore {
            account: Account
            index: number
        }

        const toScore: PendingScore[] = []

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i]
            const managedAccountKey = getManagedAccountKeyFromAccount(account)

            if (this.isCorrelatedManagedAccountLinkedInFusion(account)) {
                log.info(
                    `Dropping managed account already linked in Fusion from work queue: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
                )
                run.claimAccount(managedAccountKey!, account.identityId)
                processedCount++
                updateProgress()
                continue
            }

            const sourceInfo = account.sourceName ? run.sourcesByName.get(account.sourceName) : undefined
            const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative

            if (account.sourceName && run.sourcesWithoutReviewers.has(account.sourceName)) {
                const fusionAccount = await accountAssembly.assembleManagedAccount(account)
                const nonMatchAccount = await this.handleNoReviewerAccount(
                    fusionAccount,
                    sourceType,
                    sourceInfo,
                    account
                )
                processedCount++
                updateProgress()
                this.bumpNonMatch(result)
                result.resolved.push({
                    account,
                    fusionAccount: nonMatchAccount ?? fusionAccount,
                    resolution: 'non-match',
                })
                continue
            }

            if (account.uncorrelated === false) {
                log.info(
                    `Correlated managed account not linked to Fusion; treating as non-match: ${account.name} [${account.sourceName}] (${managedAccountKey ?? 'no-key'}) identityId=${account.identityId}`
                )
                const fusionAccount = await accountAssembly.assembleManagedAccount(account)
                const orphanIdentityId = account.identityId
                if (orphanIdentityId) {
                    const identity = run.getIdentity(orphanIdentityId)
                    if (identity && !identity.protected) {
                        fusionAccount.addIdentityLayer(identity)
                    }
                }
                run.claimAccount(managedAccountKey!, account.identityId)
                const nonMatchAccount = await this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
                processedCount++
                updateProgress()
                this.bumpNonMatch(result)
                result.resolved.push({
                    account,
                    fusionAccount: nonMatchAccount ?? fusionAccount,
                    resolution: 'non-match',
                })
                continue
            }

            toScore.push({ account, index: i })
        }

        if (toScore.length > 0) {
            const allAccounts = toScore.map((item) => item.account)
            const { identityResults, pendingDeferred } = await scoreIdentityPhase(
                allAccounts,
                batchSize,
                this.scoringDeps()
            )

            for (const scored of identityResults) {
                if (run.analysisRecorder) {
                    run.analysisRecorder.recordAnalysis(scored.analysis)
                }
                const resolved = await this.dispatchOutcome(scored)
                processedCount++
                updateProgress()
                if (resolved) {
                    result.resolved.push(resolved)
                    const countKey = resolutionCountKey(resolved.resolution)
                    if (countKey === 'nonMatch') {
                        this.bumpNonMatch(result)
                    } else {
                        result[countKey]++
                    }
                }
            }

            const { resolved: drainResolved } = await this.runDeferredDrain(pendingDeferred)
            for (const match of drainResolved) {
                processedCount++
                updateProgress()
                result.resolved.push(match)
                const countKey = resolutionCountKey(match.resolution)
                if (countKey === 'nonMatch') {
                    this.bumpNonMatch(result)
                } else {
                    result[countKey]++
                }
            }
        }

        result.processed = processedCount
        result.matchScoringMs = run.matchScoringMs
        return result
    }

    private async runAnalysisOnly(accounts: Account[], batchSize: number): Promise<MatchSweepResult> {
        const result: MatchSweepResult = {
            processed: accounts.length,
            matchScoringMs: this.deps.run.matchScoringMs,
            exact: 0,
            partial: 0,
            deferred: 0,
            nonMatch: 0,
            resolved: [],
        }

        if (accounts.length === 0) {
            return result
        }

        const { identityResults, pendingDeferred } = await scoreIdentityPhase(accounts, batchSize, this.scoringDeps())
        const { scored: drainScored } = await this.runDeferredDrain(pendingDeferred, { analysisOnly: true })

        for (const scored of [...identityResults, ...drainScored]) {
            const resolution: MatchResolution =
                scored.resolution === 'identity-match' ? 'partial-match' : scored.resolution
            result[resolutionCountKey(resolution)]++
            result.resolved.push({
                account: scored.analysis.account,
                fusionAccount: scored.analysis.fusionAccount,
                resolution,
                analysis: scored.analysis,
            })
        }

        result.matchScoringMs = this.deps.run.matchScoringMs
        return result
    }

    private isCorrelatedManagedAccountLinkedInFusion(account: Account): boolean {
        return isManagedAccountLinkedInFusion(account, this.deps.run)
    }

    private async handleNoReviewerAccount(
        fusionAccount: FusionAccount,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined,
        account: Account
    ): Promise<FusionAccount | undefined> {
        if (await applyNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, account, this.deps)) {
            this.deps.log.debug(
                `Account ${account.name} [${fusionAccount.sourceName}] has no reviewers and sourceType=${sourceType}, skipping`
            )
            return undefined
        }
        return this.finalizeAuthoritativeNonMatch(fusionAccount)
    }

    private async dispatchOutcome(scored: ManagedAccountMatchingResult): Promise<ResolvedMatch | undefined> {
        const { analysis } = scored
        const { fusionAccount, account, sourceInfo, sourceType } = analysis

        if (scored.resolution === 'identity-match') {
            if (!this.deps.accountAssembly.isAggregationAccountListMode()) {
                fusionAccount.clearFusionIdentityReferences()
                return { account, fusionAccount, resolution: 'partial-match' }
            }
            const bestMatch = this.getBestAutoAssignMatch(fusionAccount.fusionMatches)
            if (this.deps.config.fusionEnableAutoMerge && bestMatch?.identityId) {
                const assigned = await this.handleExactMatch(fusionAccount, account, bestMatch.identityId)
                return assigned
                    ? {
                          account,
                          fusionAccount: assigned,
                          resolution: 'exact-match',
                          identityId: bestMatch.identityId,
                      }
                    : undefined
            }
            await this.handlePartialMatch(fusionAccount, sourceInfo, account)
            return { account, fusionAccount, resolution: 'partial-match' }
        }

        if (scored.resolution === 'deferred-match') {
            await this.handleDeferredMatch(fusionAccount, account)
            return { account, fusionAccount, resolution: 'deferred-match' }
        }

        const nonMatchAccount = await this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
        return { account, fusionAccount: nonMatchAccount ?? fusionAccount, resolution: 'non-match' }
    }

    private async handleExactMatch(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): Promise<FusionAccount | undefined> {
        this.deps.run.removeMatchAccount(fusionAccount.managedAccountId)
        this.deps.log.debug(
            `Account ${account.name} [${fusionAccount.sourceName}] meets the automatic merge threshold, auto-merging into identity ${identityId}`
        )
        this.deps.run.markAutoMerged(identityId)
        this.deps.log.recordEvent('autoMerged')
        const syntheticDecision = this.deps.forms.createAutomaticMergeDecision(fusionAccount, account, identityId)
        this.deps.forms.registerFinishedDecision(syntheticDecision)
        return this.deps.decisionProcessor.processFusionIdentityDecision(syntheticDecision)
    }

    private async handlePartialMatch(
        fusionAccount: FusionAccount,
        sourceInfo: SourceInfo | undefined,
        account: Account
    ): Promise<void> {
        assert(sourceInfo, 'Source info not found')
        const reviewers = this.deps.run.reviewersBySourceId.get(sourceInfo.id!)
        try {
            const outcome = await this.deps.forms.createFusionForm(fusionAccount, reviewers)
            if (!outcome.formDefinitionReady) {
                const matchCount = fusionAccount.fusionMatches.length
                const maxForm = this.deps.config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
                const message =
                    !reviewers || reviewers.size === 0
                        ? 'Match review form was not created: no reviewers available for this source'
                        : `Match review form was not created (${matchCount} potential match(es); form lists up to ${maxForm} highest-scoring candidate(s))`
                this.deps.run.trackFailed(fusionAccount, message)
            } else {
                this.deps.log.recordEvent('formsQueued')
                const managedAccountKey = getManagedAccountKeyFromAccount(account)
                if (managedAccountKey) {
                    this.deps.run.claimAccount(managedAccountKey, account.identityId)
                }
                const eligibleReviewerCount = [...(reviewers ?? [])].filter((r) => r.identityId).length
                if (eligibleReviewerCount > 0 && outcome.newReviewInstancesQueued === 0) {
                    this.deps.run.removeMatchAccount(fusionAccount.managedAccountId)
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.deps.run.trackFailed(fusionAccount, `Form creation failed: ${message}`)
        }
        fusionAccount.clearFusionIdentityReferences()
    }

    private async handleDeferredMatch(
        fusionAccount: FusionAccount,
        account: Account,
        remainingInQueue?: Map<string, ManagedAccountAnalysisContext>,
        materializedEarly?: Set<string>
    ): Promise<void> {
        if (remainingInQueue && materializedEarly) {
            await this.materializeMatchedPendingCandidates(fusionAccount, remainingInQueue, materializedEarly)
        }

        const deferredMatches = anchorDeferredMatches(fusionAccount, this.deps.run)
        const { headline, summary } = formatFusionMatchDiscoveryLog(deferredMatches, true)
        this.deps.log.recordEvent('match', { type: 'deferred' })
        if (this.deps.log.getLogLevel() === 'debug') {
            this.deps.log.debug(
                `${headline}: ${account.name} [${account.sourceName}] - ${summary}; skipping account for now`
            )
        }
        this.deps.run.claimAccount(getManagedAccountKeyFromAccount(account)!, account.identityId)
    }

    private async materializeMatchedPendingCandidates(
        fusionAccount: FusionAccount,
        remainingInQueue: Map<string, ManagedAccountAnalysisContext>,
        materializedEarly: Set<string>
    ): Promise<void> {
        for (const match of fusionAccount.fusionMatches) {
            if (match.candidateType !== 'deferred') continue
            const candidate = match.fusionIdentity
            if (!candidate) continue

            const candidateKey = candidate.managedKey
            if (!candidateKey || candidateKey === fusionAccount.managedKey) continue

            const tier = this.deps.run.getDeferredCandidateTier(candidate)
            if (tier === 'persisted' || tier === 'finalized') continue

            if (!remainingInQueue.has(candidateKey) && tier !== 'pending') continue

            const pendingAnalysis = remainingInQueue.get(candidateKey)
            const accountToMaterialize = pendingAnalysis?.fusionAccount ?? candidate
            await this.finalizeAuthoritativeNonMatch(accountToMaterialize)
            materializedEarly.add(candidateKey)
            remainingInQueue.delete(candidateKey)
        }
    }

    private async handleNonMatch(
        fusionAccount: FusionAccount,
        account: Account,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined> {
        if (await applyNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, account, this.deps)) {
            return undefined
        }
        await this.finalizeAuthoritativeNonMatch(fusionAccount)
        const mk = getManagedAccountKeyFromAccount(account)
        this.deps.log.debug(
            `Registered managed account as fusion account: ${account.name} [${account.sourceName}] (${mk ?? 'no-key'})`
        )
        return fusionAccount
    }

    private async finalizeAuthoritativeNonMatch(fusionAccount: FusionAccount): Promise<FusionAccount> {
        fusionAccount.setNonMatched()
        this.deps.run.registerFusionAccount(fusionAccount, this.deps.run.analysisRecorder?.tracker)
        if (isDeferredMatchingEnabledForSource(fusionAccount.sourceName, this.deps.run.sourcesByName)) {
            this.deps.run.registerFinalizedDeferredCandidate(fusionAccount)
        }
        return fusionAccount
    }

    private bumpNonMatch(result: MatchSweepResult): void {
        result.nonMatch++
        this.deps.log.recordEvent('nonMatch')
    }

    private getBestAutoAssignMatch(
        matches: import('./types').FusionMatch[]
    ): import('./types').FusionMatch | undefined {
        if (this.deps.config.fusionAutoMergeScore === undefined) return undefined
        let bestMatch: import('./types').FusionMatch | undefined
        let highestScore = -1
        for (const m of matches) {
            const combinedReport = m.scores.find((s) => s.attribute === COMBINED_SCORE_ROW_ATTRIBUTE)
            const score = combinedReport?.score ?? 0
            if (score >= this.deps.config.fusionAutoMergeScore && score > highestScore) {
                highestScore = score
                bestMatch = m
            }
        }
        return bestMatch
    }
}

// ============================================================================
// Helpers
// ============================================================================

function hasIdentityCandidateMatchesFn(fusionAccount: FusionAccount): boolean {
    return fusionAccount.fusionMatches.some((match) => (match.candidateType ?? 'identity') === 'identity')
}

function resolutionCountKey(resolution: MatchResolution): 'exact' | 'partial' | 'deferred' | 'nonMatch' {
    switch (resolution) {
        case 'exact-match':
            return 'exact'
        case 'partial-match':
            return 'partial'
        case 'deferred-match':
            return 'deferred'
        case 'non-match':
            return 'nonMatch'
    }
}

