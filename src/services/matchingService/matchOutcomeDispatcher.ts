import { AccountV2025 as Account } from 'sailpoint-api-client'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceType } from '../../model/config'
import { FusionAccount } from '../../model/account'
import { FusionDecision } from '../../model/form'
import { FusionRun } from '../../model/fusionRun'
import { LogService, PhaseTimer } from '../logService'
import { SourceInfo } from '../sourceService'
import { FormService } from '../formService'
import { MatchingService, COMBINED_SCORE_ROW_ATTRIBUTE } from './matchingService'
import {
    formatFusionMatchDiscoveryLog,
    hasDeferredCandidateMatches,
    isDeferredMatchingEnabledForSource,
    isRecordMatchingEnabledForSource,
} from './matchingHelpers'
import { ManagedAccountAnalysisContext, ManagedAccountMatchingResult, MatchCandidateType } from './types'
import { AccountAssembly } from '../accountAssembly'
import { CorrelationManager } from '../correlationManager'
import { DefinitionService } from '../definitionService'
import { assert } from '../../utils/assert'
import { hasValue } from '../../utils/safeRead'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
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

/**
 * Scores a batch of managed accounts against identity and deferred candidates.
 * This is the scoring-only path shared by the dispatch sweep and analysis-only callers.
 * It does not apply outcomes or create review forms.
 */
async function scoreManagedAccounts(
    accounts: Account[],
    batchSize: number,
    deps: ScoreManagedAccountsDeps
): Promise<ManagedAccountMatchingResult[]> {
    const { config, log, run, matchingService, accountAssembly } = deps
    const results: ManagedAccountMatchingResult[] = []
    const pendingDeferred: { analysis: ManagedAccountAnalysisContext; account: Account }[] = []
    const maxCandidatesForForm = config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
    const scoringConcurrency = Math.max(1, Math.min(batchSize, getScoringMaxConcurrency(config)))

    const scoreIdentityCandidates = async (account: Account): Promise<ManagedAccountAnalysisContext> => {
        const { name, sourceName } = account
        const fusionAccount = await accountAssembly.assembleManagedAccount(account)
        const sourceInfo = sourceName ? run.sourcesByName.get(sourceName) : undefined
        const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative
        const recordMatchingEnabled = isRecordMatchingEnabledForSource(sourceName ?? undefined, run.sourcesByName)
        let fusionIdentityComparisons = 0
        let hasIdentityCandidateMatches = false

        if (recordMatchingEnabled) {
            const excludeIds =
                config.fusionEnableAutoAssignment && run.autoAssignedIdentityIds.size > 0
                    ? run.autoAssignedIdentityIds
                    : undefined
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

    const scoreDeferredCandidates = async (analysis: ManagedAccountAnalysisContext): Promise<void> => {
        if (analysis.hasIdentityCandidateMatches) return
        if (!isDeferredMatchingEnabledForSource(analysis.account.sourceName ?? undefined, run.sourcesByName)) return
        const scoringStarted = Date.now()
        analysis.fusionIdentityComparisons += await matchingService.scoreFusionAccount(
            analysis.fusionAccount,
            run.currentRunDeferredCandidatesForSource(analysis.account.sourceName),
            MatchCandidateType.Deferred
        )
        run.matchScoringMs += Date.now() - scoringStarted
    }

    for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize)
        const identityResults = await promiseAllBatched(
            batch,
            (account) => scoreIdentityCandidates(account),
            scoringConcurrency
        )
        for (let j = 0; j < identityResults.length; j++) {
            const analysis = identityResults[j]
            const account = batch[j]
            if (analysis.hasIdentityCandidateMatches) {
                results.push({ analysis, resolution: 'identity-match' })
            } else if (isDeferredMatchingEnabledForSource(account.sourceName ?? undefined, run.sourcesByName)) {
                run.registerDeferredCandidate(analysis.fusionAccount)
                pendingDeferred.push({ analysis, account })
            } else {
                results.push({ analysis, resolution: 'non-match' })
            }
        }
        await yieldToEventLoop()
    }

    for (let i = 0; i < pendingDeferred.length; i += batchSize) {
        const batch = pendingDeferred.slice(i, i + batchSize)
        await promiseAllBatched(
            batch,
            async (pending) => {
                await scoreDeferredCandidates(pending.analysis)
                if (hasDeferredCandidateMatches(pending.analysis.fusionAccount)) {
                    results.push({ analysis: pending.analysis, resolution: 'deferred-match' })
                } else {
                    results.push({ analysis: pending.analysis, resolution: 'non-match' })
                }
            },
            scoringConcurrency
        )
        await yieldToEventLoop()
    }

    return results
}

// ============================================================================
// Non-authoritative no-match helper
// ============================================================================

export interface ApplyNonAuthoritativeNoMatchDeps {
    readonly definitionService: DefinitionService
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
        await deps.definitionService.registerUniqueAttributes(fusionAccount)
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

    private runScoring(accounts: Account[], batchSize: number): Promise<ManagedAccountMatchingResult[]> {
        return scoreManagedAccounts(accounts, batchSize, {
            config: this.deps.config,
            log: this.deps.log,
            run: this.deps.run,
            matchingService: this.deps.matchingService,
            accountAssembly: this.deps.accountAssembly,
        })
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
        const startedAt = Date.now()
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
        const logProgressEvery = Math.max(1, Math.min(batchSize, initialQueueSize))
        const logProgress = (): void => {
            if (
                processedCount === 1 ||
                processedCount % logProgressEvery === 0 ||
                processedCount === initialQueueSize
            ) {
                log.info(
                    `Managed accounts progress: ${processedCount}/${initialQueueSize} analyzed | RUN ELAPSED ${PhaseTimer.formatElapsed(
                        Date.now() - startedAt
                    )}`
                )
            }
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
                logProgress()
                continue
            }

            const sourceInfo = account.sourceName ? run.sourcesByName.get(account.sourceName) : undefined
            const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative

            if (account.sourceName && run.sourcesWithoutReviewers.has(account.sourceName)) {
                const fusionAccount = await accountAssembly.assembleManagedAccount(account)
                const nonMatchAccount = await this.handleNoReviewerAccount(fusionAccount, sourceType, sourceInfo, account)
                processedCount++
                logProgress()
                result.nonMatch++
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
                run.claimAccount(managedAccountKey!, account.identityId)
                const nonMatchAccount = await this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
                processedCount++
                logProgress()
                result.nonMatch++
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
            const scoredResults = await this.runScoring(
                toScore.map((item) => item.account),
                batchSize
            )

            for (let i = 0; i < scoredResults.length; i++) {
                const scored = scoredResults[i]
                if (run.analysisRecorder) {
                    run.analysisRecorder.recordAnalysis(scored.analysis)
                }
                const resolved = await this.dispatchOutcome(scored)
                processedCount++
                logProgress()
                if (resolved) {
                    result.resolved.push(resolved)
                    result[resolutionCountKey(resolved.resolution)]++
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

        const scoredResults = await this.runScoring(accounts, batchSize)
        for (const scored of scoredResults) {
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
        const key = getManagedAccountKeyFromAccount(account)
        if (key) {
            const index = this.deps.run.linkedAccountKeyIndex
            if (index) {
                if (index.has(key)) return true
            } else {
                const isLinked = [...this.deps.run.allFusionAccounts, ...this.deps.run.allFusionIdentities].some(
                    (fa) => fa.accountIdsSet.has(key) || fa.missingAccountIdsSet.has(key)
                )
                if (isLinked) return true
            }
        }
        const identityId = account.identityId
        if (hasValue(identityId) && this.deps.run.hasFusionIdentity(identityId)) {
            return true
        }
        return false
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
            if (this.deps.config.fusionEnableAutoAssignment && bestMatch?.identityId) {
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
            await this.handlePartialMatch(fusionAccount, sourceInfo)
            return { account, fusionAccount, resolution: 'partial-match' }
        }

        if (scored.resolution === 'deferred-match') {
            this.handleDeferredMatch(fusionAccount, account)
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
            `Account ${account.name} [${fusionAccount.sourceName}] meets the automatic assignment threshold, auto-assigning to identity ${identityId}`
        )
        this.deps.run.markAutoAssigned(identityId)
        const syntheticDecision = this.deps.forms.createAutomaticAssignmentDecision(fusionAccount, account, identityId)
        this.deps.forms.registerFinishedDecision(syntheticDecision)
        return this.deps.decisionProcessor.processFusionIdentityDecision(syntheticDecision)
    }

    private async handlePartialMatch(
        fusionAccount: FusionAccount,
        sourceInfo: SourceInfo | undefined
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

    private handleDeferredMatch(fusionAccount: FusionAccount, account: Account): void {
        const deferredMatches = fusionAccount.fusionMatches.filter((m) => m.candidateType === 'deferred')
        const { headline, summary } = formatFusionMatchDiscoveryLog(deferredMatches, true)
        this.deps.log.info(`${headline}: ${account.name} [${account.sourceName}] - ${summary}; skipping account for now`)
        this.deps.run.claimAccount(getManagedAccountKeyFromAccount(account)!, account.identityId)
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
        await this.deps.correlationManager.applyPerSourceCorrelationIfNeeded(fusionAccount)
        this.deps.run.registerFusionAccount(fusionAccount, this.deps.run.analysisRecorder?.tracker)
        if (isDeferredMatchingEnabledForSource(fusionAccount.sourceName, this.deps.run.sourcesByName)) {
            this.deps.run.registerDeferredCandidate(fusionAccount)
        }
        return fusionAccount
    }

    private getBestAutoAssignMatch(matches: import('./types').FusionMatch[]): import('./types').FusionMatch | undefined {
        if (this.deps.config.fusionAutoAssignmentScore === undefined) return undefined
        let bestMatch: import('./types').FusionMatch | undefined
        let highestScore = -1
        for (const m of matches) {
            const combinedReport = m.scores.find((s) => s.attribute === COMBINED_SCORE_ROW_ATTRIBUTE)
            const score = combinedReport?.score ?? 0
            if (score >= this.deps.config.fusionAutoAssignmentScore && score > highestScore) {
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


