import { AccountV2025 as Account } from 'sailpoint-api-client'
import { SourceType } from '../../model/config'
import { SourceInfo } from '../sourceService'
import { coerceBoolean } from '../../utils/safeRead'
import { FusionAccount } from '../../model/account'
import { MatchCandidateType } from '../matchService/types'
import { hasIdentityCandidateMatches as checkHasIdentityCandidateMatches } from './helpers'
import type { FusionConfig } from '../../model/config'
import type { MatchService } from '../matchService'
import type { LogService } from '../logService'
import { defaultFusionMaxCandidatesForForm } from '../../data/config'

export type ManagedAccountAnalysisContext = {
    account: Account
    fusionAccount: FusionAccount
    sourceInfo: SourceInfo | undefined
    sourceType: SourceType
    fusionIdentityComparisons: number
    hasIdentityCandidateMatches: boolean
}

export interface ManagedAccountAnalyzerState {
    readonly config: FusionConfig
    readonly matchService: MatchService
    readonly log: LogService
    readonly autoAssignedIdentityIds: ReadonlySet<string>
    readonly sourcesByName: Map<string, SourceInfo>
    readonly fusionIdentities: Iterable<FusionAccount>
    fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount>
    currentRunDeferredCandidatesForSource(sourceName: string | null | undefined): Iterable<FusionAccount>
    preProcessManagedAccount(account: Account): Promise<FusionAccount>
    addMatchScoringTimeMs(ms: number): void
}

export class ManagedAccountAnalyzer {
    constructor(private state: ManagedAccountAnalyzerState) {}

    public async scoreIdentityCandidates(account: Account): Promise<ManagedAccountAnalysisContext> {
        const { name, sourceName } = account
        const fusionAccount = await this.state.preProcessManagedAccount(account)
        const sourceInfo = account.sourceName ? this.state.sourcesByName.get(account.sourceName) : undefined
        const sourceType = sourceInfo?.sourceType ?? SourceType.Authoritative
        const recordMatchingEnabled = this.isRecordMatchingEnabledForSource(account.sourceName ?? undefined)
        let fusionIdentityComparisons = 0
        let hasIdentityCandidateMatches = false

        if (recordMatchingEnabled) {
            const excludeIds =
                this.state.config.fusionEnableAutoAssignment && this.state.autoAssignedIdentityIds.size > 0
                    ? this.state.autoAssignedIdentityIds
                    : undefined
            
            const candidateSet = this.state.matchService.getCandidates(fusionAccount, excludeIds)
            const identityPool: Iterable<FusionAccount> =
                candidateSet ?? (excludeIds ? this.state.fusionIdentitiesExcluding(excludeIds) : this.state.fusionIdentities)
            
            const identityScoringStarted = Date.now()
            fusionIdentityComparisons = await this.state.matchService.scoreFusionAccount(
                fusionAccount,
                identityPool,
                MatchCandidateType.Identity,
                this.state.config.fusionMaxCandidatesForForm ?? defaultFusionMaxCandidatesForForm()
            )
            this.state.addMatchScoringTimeMs(Date.now() - identityScoringStarted)
            hasIdentityCandidateMatches = checkHasIdentityCandidateMatches(fusionAccount)
        } else {
            this.state.log.debug(
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

    public async scoreDeferredCandidates(analysis: ManagedAccountAnalysisContext): Promise<void> {
        if (analysis.hasIdentityCandidateMatches) {
            return
        }
        if (!this.isDeferredMatchingEnabledForSource(analysis.account.sourceName ?? undefined)) {
            return
        }
        
        const deferredScoringStarted = Date.now()
        analysis.fusionIdentityComparisons += await this.state.matchService.scoreFusionAccount(
            analysis.fusionAccount,
            this.state.currentRunDeferredCandidatesForSource(analysis.account.sourceName),
            MatchCandidateType.Deferred
        )
        this.state.addMatchScoringTimeMs(Date.now() - deferredScoringStarted)
    }

    public isDeferredMatchingEnabledForSource(sourceName: string | undefined): boolean {
        if (!sourceName) return false
        const info = this.state.sourcesByName.get(sourceName)
        const sourceType = info?.sourceType ?? SourceType.Authoritative
        if (sourceType !== SourceType.Authoritative) return false
        if (!info?.config) return true
        return coerceBoolean(info.config.deferredMatching) ?? true
    }

    public isRecordMatchingEnabledForSource(sourceName: string | undefined): boolean {
        if (!sourceName) return true
        const info = this.state.sourcesByName.get(sourceName)
        const sourceType = info?.sourceType ?? SourceType.Authoritative
        if (sourceType !== SourceType.Record) {
            return true
        }
        return coerceBoolean(info?.config?.includeRecordAccountsForMatching) ?? true
    }
}
