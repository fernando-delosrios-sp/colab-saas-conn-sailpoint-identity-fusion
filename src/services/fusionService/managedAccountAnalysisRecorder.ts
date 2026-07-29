import { FusionAccount } from '../../model/account'
import { FusionConfig, SourceType } from '../../model/config'
import { LogService } from '../logService'
import { SourceInfo, SourceService } from '../sourceService'
import { UrlContext } from '../../utils/url'
import { AggregationTracker } from '../../model/aggregationTracker'
import { FusionRun } from '../../model/fusionRun'
import {
    buildMinimalFusionReportAccount,
    buildDeferredMatchReportRows,
} from './helpers'
import {
    identityMatchesForReview,
    isDeferredMatchingEnabledForSource,
    logFusionMatchDiscovery,
} from '../matchingService/matchingHelpers'
import { ManagedAccountAnalysisContext } from '../matchingService/types'
import { resolveFusionMaxCandidatesForForm } from '../../data/config'
import { resolveReportAccountId } from './reportAccountResolver'

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
        const maxCandidates = resolveFusionMaxCandidatesForForm(this.deps.config.fusionMaxCandidatesForForm)
        if (fusionAccount.isMatch) {
            if (hasIdentityCandidateMatches) {
                logFusionMatchDiscovery(
                    log,
                    identityMatchesForReview(fusionAccount, maxCandidates),
                    false,
                    name,
                    sourceName
                )
            }
            if (!shouldCaptureReportData()) return
            const reportAccountId = resolveReportAccountId(fusionAccount, sources)
            if (hasIdentityCandidateMatches) {
                trackerInstance.matchAccounts.push(fusionAccount)
                return
            }
            const sourceTypeValue = sourcesByName.get(fusionAccount.sourceName)?.sourceType
            const deferredMatches = buildDeferredMatchReportRows(
                fusionAccount,
                this.deps.run,
                maxCandidates,
                urlContext,
                sources
            )
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




