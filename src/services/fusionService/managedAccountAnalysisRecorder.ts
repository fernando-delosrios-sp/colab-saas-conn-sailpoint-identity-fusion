import { FusionAccount } from '../../model/account'
import { FusionConfig, SourceType } from '../../model/config'
import { LogService } from '../logService'
import { SourceInfo, SourceService } from '../sourceService'
import { UrlContext } from '../../utils/url'
import { AggregationTracker } from '../../model/aggregationTracker'
import { FusionRun } from '../../model/fusionRun'
import {
    buildMinimalFusionReportAccount,
    fusionReportDeferredMatchCandidateFields,
    mapScoreReportsForFusionReport,
} from './helpers'
import {
    anchorDeferredMatches,
    formatFusionMatchDiscoveryLog,
    isDeferredMatchingEnabledForSource,
} from '../matchingService/matchingHelpers'
import { isExactAttributeMatchScores } from '../matchingService/exactMatch'
import { ManagedAccountAnalysisContext, MatchCandidateType } from '../matchingService/types'
import { resolveReportAccountId, resolveReportAccountIdValue } from './reportAccountResolver'

export interface ManagedAccountAnalysisRecorderDeps {
    log: LogService
    tracker: () => AggregationTracker
    urlContext: UrlContext
    reportAttributes: string[]
    sourcesByName: Map<string, SourceInfo>
    config: FusionConfig
    sources: SourceService
    run: FusionRun
    shouldCaptureReportData: () => boolean
}

export class ManagedAccountAnalysisRecorder {
    constructor(private readonly deps: ManagedAccountAnalysisRecorderDeps) {}

    get tracker(): AggregationTracker | undefined {
        try {
            return this.deps.tracker()
        } catch {
            return undefined
        }
    }

    recordAnalysis(analysis: ManagedAccountAnalysisContext): void {
        const { account, fusionAccount, sourceType, hasIdentityCandidateMatches, fusionIdentityComparisons } = analysis
        const { name, sourceName } = account
        const { log, tracker, urlContext, reportAttributes, sourcesByName, sources, shouldCaptureReportData } =
            this.deps
        const trackerInstance = tracker()

        trackerInstance.fusionIdentityComparisonsByAccount.set(fusionAccount, fusionIdentityComparisons)
        if (fusionAccount.isMatch) {
            if (hasIdentityCandidateMatches) {
                const identityMatches = fusionAccount.fusionMatches.filter(
                    (m) => (m.candidateType ?? MatchCandidateType.Identity) === MatchCandidateType.Identity
                )
                const { headline, summary } = formatFusionMatchDiscoveryLog(identityMatches, false)
                const matchType = headline.includes('EXACT') ? 'exact' : 'partial'
                log.recordEvent('match', { type: matchType })
                if (log.getLogLevel() === 'debug') {
                    log.debug(`${headline}: ${name} [${sourceName}] - ${summary}`)
                }
            }
            if (!shouldCaptureReportData()) return
            const reportAccountId = resolveReportAccountId(fusionAccount, sources)
            if (hasIdentityCandidateMatches) {
                trackerInstance.matchAccounts.push(fusionAccount)
                return
            }
            const sourceTypeValue = sourcesByName.get(fusionAccount.sourceName)?.sourceType
            const deferredMatches = anchorDeferredMatches(fusionAccount, this.deps.run).map((match) => {
                    const fields = fusionReportDeferredMatchCandidateFields(match)
                    const fi = match.fusionIdentity
                    const deferredCandidateIdentityId = fi?.identityId
                    const managedKey = fi?.managedKeyOrUndefined ?? fi?.managedAccountId ?? fields.accountId
                    const managedAccountReportId = resolveReportAccountIdValue(managedKey, sources)
                    const identityUrl = managedAccountReportId
                        ? urlContext.humanAccount(managedAccountReportId)
                        : deferredCandidateIdentityId
                          ? urlContext.identity(deferredCandidateIdentityId)
                          : undefined
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
            isDeferredMatchingEnabledForSource(fusionAccount.sourceName, sourcesByName)
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



