import { FusionAccount } from '../../model/account'
import { FusionConfig, SourceType } from '../../model/config'
import { LogService } from '../logService'
import { SourceInfo, SourceService } from '../sourceService'
import { UrlContext } from '../../utils/url'
import { ManagedAccountAnalyzer, ManagedAccountAnalysisContext } from './managedAccountAnalyzer'
import { AggregationTracker } from './aggregationTracker'
import {
    buildMinimalFusionReportAccount,
    formatFusionMatchDiscoveryLog,
    fusionReportMatchCandidateAccountFields,
    mapScoreReportsForFusionReport,
} from './helpers'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { MatchCandidateType } from '../scoringService/types'
import { resolveReportAccountId, resolveReportAccountIdValue } from './reportAccountResolver'

export interface ManagedAccountAnalysisRecorderDeps {
    log: LogService
    tracker: () => AggregationTracker
    urlContext: UrlContext
    reportAttributes: string[]
    sourcesByName: Map<string, SourceInfo>
    config: FusionConfig
    analyzer: ManagedAccountAnalyzer
    sources: SourceService
    shouldCaptureReportData: () => boolean
}

export class ManagedAccountAnalysisRecorder {
    constructor(private readonly deps: ManagedAccountAnalysisRecorderDeps) {}

    recordAnalysis(analysis: ManagedAccountAnalysisContext): void {
        const { account, fusionAccount, sourceType, hasIdentityBackedMatches, fusionIdentityComparisons } = analysis
        const { name, sourceName } = account
        const { log, tracker, urlContext, reportAttributes, sourcesByName, analyzer, sources, shouldCaptureReportData } =
            this.deps
        const trackerInstance = tracker()

        trackerInstance.fusionIdentityComparisonsByAccount.set(fusionAccount, fusionIdentityComparisons)
        if (fusionAccount.isMatch) {
            if (hasIdentityBackedMatches) {
                const identityMatches = fusionAccount.fusionMatches.filter(
                    (m) => (m.candidateType ?? MatchCandidateType.Identity) === MatchCandidateType.Identity
                )
                const { headline, summary } = formatFusionMatchDiscoveryLog(identityMatches, false)
                log.info(`${headline}: ${name} [${sourceName}] - ${summary}`)
            }
            if (!shouldCaptureReportData()) return
            const reportAccountId = resolveReportAccountId(fusionAccount, sources)
            if (hasIdentityBackedMatches) {
                trackerInstance.matchAccounts.push(fusionAccount)
                return
            }
            const sourceTypeValue = sourcesByName.get(fusionAccount.sourceName)?.sourceType
            const deferredMatches = fusionAccount.fusionMatches
                .filter((match) => match.candidateType === MatchCandidateType.Deferred)
                .map((match) => {
                    const fields = fusionReportMatchCandidateAccountFields(match)
                    const fi = match.fusionIdentity
                    const deferredCandidateIdentityId = fi?.identityId
                    const deferredCandidateManagedAccountReportId = resolveReportAccountIdValue(fi?.managedAccountId, sources)
                    const candidateAccountReportId = resolveReportAccountIdValue(fields.accountId, sources)
                    const identityUrl =
                        (deferredCandidateIdentityId ? urlContext.identity(deferredCandidateIdentityId) : undefined) ??
                        (deferredCandidateManagedAccountReportId ? urlContext.humanAccount(deferredCandidateManagedAccountReportId) : undefined) ??
                        (candidateAccountReportId ? urlContext.humanAccount(candidateAccountReportId) : undefined)
                    return {
                        ...fields,
                        identityName: match.identityName,
                        identityId: deferredCandidateIdentityId,
                        identityUrl,
                        isMatch: true,
                        candidateType: MatchCandidateType.Deferred,
                        exact: isExactAttributeMatchScores(match.scores),
                        scores: mapScoreReportsForFusionReport(match.scores),
                    }
                })
            trackerInstance.deferredMatchReportData.push({
                ...buildMinimalFusionReportAccount(
                    fusionAccount,
                    urlContext,
                    sourceTypeValue,
                    reportAttributes,
                    undefined,
                    reportAccountId
                ),
                deferred: true,
                fusionIdentityComparisons,
                matches: deferredMatches,
            })
            return
        }
        log.debug(`No match found for managed account: ${name} [${sourceName}]`)
        if (
            sourceType === SourceType.Authoritative &&
            analyzer.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)
        ) {
            return
        }
        if (!shouldCaptureReportData()) return
        trackerInstance.analyzedNonMatchReportData.push({
            ...buildMinimalFusionReportAccount(
                fusionAccount,
                urlContext,
                sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                reportAttributes,
                undefined,
                resolveReportAccountId(fusionAccount, sources)
            ),
            fusionIdentityComparisons,
        })
    }

    trackFailed(fusionAccount: FusionAccount, error: string): void {
        const { log, tracker, urlContext, reportAttributes, sourcesByName, sources, shouldCaptureReportData } = this.deps
        const trackerInstance = tracker()
        log.error(`Failed matching for account ${fusionAccount.name} [${fusionAccount.sourceName}]: ${error}`)
        if (!shouldCaptureReportData()) return
        trackerInstance.failedMatchingAccounts.push({
            ...buildMinimalFusionReportAccount(
                fusionAccount,
                urlContext,
                sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                reportAttributes,
                error,
                resolveReportAccountId(fusionAccount, sources)
            ),
            fusionIdentityComparisons: trackerInstance.fusionIdentityComparisonsByAccount.get(fusionAccount) ?? 0,
        })
    }
}
