import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../model/account'
import { FusionDecision } from '../../model/form'
import { FusionConfig, SourceType } from '../../model/config'
import { LogService } from '../logService'
import { FormService } from '../formService'
import { DefinitionService } from '../definitionService'
import { MatchingService } from './matchingService'
import { CorrelationManager } from '../fusionService/correlationManager'
import { CandidateRegistry } from './candidateRegistry'
import { FusionRun } from '../../model/fusionRun'
import { SourceInfo } from '../sourceService'
import { FusionMatch } from './types'
import { assert } from '../../utils/assert'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { createAutomaticAssignmentDecision, formatFusionMatchDiscoveryLog } from '../fusionService/helpers'
import { defaultFusionMaxCandidatesForForm } from '../../data/config'

export interface ManagedAccountOutcomeHandlerDeps {
    readonly config: FusionConfig
    readonly log: LogService
    readonly run: FusionRun
    readonly forms: FormService
    readonly definitionService: DefinitionService
    readonly matchingService: MatchingService
    readonly correlationManager: CorrelationManager
    readonly candidateRegistry: CandidateRegistry
    readonly reviewersBySourceId: Map<string, Set<FusionAccount>>
    readonly sourcesWithoutReviewers: Set<string>
    preProcessManagedAccount(account: Account): Promise<FusionAccount>
    processFusionIdentityDecision(decision: FusionDecision): Promise<FusionAccount | undefined>
    removeMatchAccount(managedAccountId: string | undefined): void
    queueDisableOperation(account: Account): void
    isAggregationAccountListMode(): boolean
    shouldPruneDeletedManagedAccounts(): boolean
    registerFusionBlend(fa: FusionAccount, account: Account): void
    applyAttributeProcessing(fa: FusionAccount): Promise<void>
    setFusionAccount(fa: FusionAccount): void
    addMatchScoringTimeMs(ms: number): void
    isDeferredMatchingEnabledForSource(sourceName: string | undefined): boolean
}

export class ManagedAccountOutcomeHandler {
    constructor(private readonly deps: ManagedAccountOutcomeHandlerDeps) {}

    get run(): FusionRun { return this.deps.run }
    get log(): LogService { return this.deps.log }
    get config(): FusionConfig { return this.deps.config }

    public async handleNonAuthoritativeNoMatch(
        fusionAccount: FusionAccount,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined,
        account?: Account
    ): Promise<boolean> {
        if (sourceType === SourceType.Record) {
            await this.deps.definitionService.registerUniqueAttributes(fusionAccount)
            return true
        }
        if (sourceType === SourceType.Orphan) {
            if (sourceInfo?.config?.disableNonMatchingAccounts && account) {
                this.deps.queueDisableOperation(account)
            }
            return true
        }
        return false
    }

    public async handleNoReviewerAccount(
        account: Account,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined> {
        const fusionAccount = await this.deps.preProcessManagedAccount(account)
        if (await this.handleNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, account)) {
            this.log.debug(
                `Account ${account.name} [${fusionAccount.sourceName}] has no reviewers and sourceType=${sourceType}, skipping`
            )
            return undefined
        }
        return this.finalizeAuthoritativeNonMatch(fusionAccount)
    }

    public async handleExactMatch(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): Promise<FusionAccount | undefined> {
        this.deps.removeMatchAccount(fusionAccount.managedAccountId)
        this.log.debug(
            `Account ${account.name} [${fusionAccount.sourceName}] meets the automatic assignment threshold, auto-assigning to identity ${identityId}`
        )
            this.run.markAutoAssigned(identityId)
        const syntheticDecision = createAutomaticAssignmentDecision(fusionAccount, account, identityId)
        this.deps.forms.registerFinishedDecision(syntheticDecision)
        return this.deps.processFusionIdentityDecision(syntheticDecision)
    }

    public handleIdentityMatch(
        fusionAccount: FusionAccount,
        account: Account,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined> {
        if (!this.deps.isAggregationAccountListMode()) {
            fusionAccount.clearFusionIdentityReferences()
            return Promise.resolve(undefined)
        }
        const bestMatch = this.getBestAutoAssignMatch(fusionAccount.fusionMatches)
        if (this.config.fusionEnableAutoAssignment && bestMatch?.identityId) {
            return this.handleExactMatch(fusionAccount, account, bestMatch.identityId)
        }
        return this.handlePartialMatch(fusionAccount, sourceInfo)
    }

    public async handlePartialMatch(
        fusionAccount: FusionAccount,
        sourceInfo: SourceInfo | undefined
    ): Promise<undefined> {
        assert(sourceInfo, 'Source info not found')
        const reviewers = this.deps.reviewersBySourceId.get(sourceInfo.id!)
        try {
            const outcome = await this.deps.forms.createFusionForm(fusionAccount, reviewers)
            if (!outcome.formDefinitionReady) {
                const matchCount = fusionAccount.fusionMatches.length
                const maxForm = this.config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
                const message =
                    !reviewers || reviewers.size === 0
                        ? 'Match review form was not created: no reviewers available for this source'
                        : `Match review form was not created (${matchCount} potential match(es); form lists up to ${maxForm} highest-scoring candidate(s))`
                this.run.analysisRecorder!.trackFailed(fusionAccount, message)
            } else {
                const eligibleReviewerCount = [...(reviewers ?? [])].filter((r) => r.identityId).length
                if (eligibleReviewerCount > 0 && outcome.newReviewInstancesQueued === 0) {
                    this.deps.removeMatchAccount(fusionAccount.managedAccountId)
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.run.analysisRecorder!.trackFailed(fusionAccount, `Form creation failed: ${message}`)
        }
        fusionAccount.clearFusionIdentityReferences()
        return undefined
    }

    public handleDeferredMatch(fusionAccount: FusionAccount, account: Account): undefined {
        const deferredMatches = fusionAccount.fusionMatches.filter((m) => m.candidateType === 'deferred')
        const { headline, summary } = formatFusionMatchDiscoveryLog(deferredMatches, true)
        this.log.info(`${headline}: ${account.name} [${account.sourceName}] - ${summary}; skipping account for now`)
        this.run.claimAccount(getManagedAccountKeyFromAccount(account)!, account.identityId)
        return undefined
    }

    public async handleNonMatch(
        fusionAccount: FusionAccount,
        account: Account,
        sourceType: SourceType,
        sourceInfo: SourceInfo | undefined
    ): Promise<FusionAccount | undefined> {
        if (await this.handleNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, account)) {
            return undefined
        }
        await this.finalizeAuthoritativeNonMatch(fusionAccount)
        const mk = getManagedAccountKeyFromAccount(account)
        this.log.debug(
            `Registered managed account as fusion account: ${account.name} [${account.sourceName}] (${mk ?? 'no-key'})`
        )
        return fusionAccount
    }

    public async finalizeAuthoritativeNonMatch(fusionAccount: FusionAccount): Promise<FusionAccount> {
        fusionAccount.setNonMatched()
        await this.deps.correlationManager.applyPerSourceCorrelationIfNeeded(fusionAccount)
        this.deps.setFusionAccount(fusionAccount)
        if (this.deps.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)) {
            this.deps.candidateRegistry.register(fusionAccount)
        }
        return fusionAccount
    }

    private getBestAutoAssignMatch(matches: FusionMatch[]): FusionMatch | undefined {
        if (this.config.fusionAutoAssignmentScore === undefined) return undefined
        let bestMatch: FusionMatch | undefined
        let highestScore = -1
        for (const m of matches) {
            const combinedReport = m.scores.find((s) => (s as any).attribute === 'Combined score')
            const score = combinedReport?.score ?? 0
            if (score >= this.config.fusionAutoAssignmentScore && score > highestScore) {
                highestScore = score
                bestMatch = m
            }
        }
        return bestMatch
    }
}
