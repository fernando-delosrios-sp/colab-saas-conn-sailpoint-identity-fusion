import { StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { readBoolean, readUnknown } from '../../utils/safeRead'
import { normalizeEmailValue, sanitizeRecipients } from '../../services/emailService/email'
import { IdentityService } from '../../services/identityService'
import { AggregationStats } from '../../services/fusionService/types'

export interface FetchResult {
    identitiesFound: number
    managedAccountsFound: number
    managedAccountsFoundAuthoritative: number
    managedAccountsFoundRecord: number
    managedAccountsFoundOrphan: number
}

export function createEmptyFetchResult(): FetchResult {
    return {
        identitiesFound: 0,
        managedAccountsFound: 0,
        managedAccountsFoundAuthoritative: 0,
        managedAccountsFoundRecord: 0,
        managedAccountsFoundOrphan: 0,
    }
}

export function resolveIdentitiesFound(
    fetchResult: FetchResult | undefined,
    identities?: Pick<IdentityService, 'identitiesLoadedCount'>
): number {
    const fetchCount = fetchResult?.identitiesFound ?? 0
    const loadedCount = identities?.identitiesLoadedCount ?? fetchCount
    return Math.max(fetchCount, loadedCount)
}

function fetchResultToAggregationStats(
    fetchResult: FetchResult,
    timer: ReturnType<ServiceRegistry['log']['timer']>,
    options?: {
        fusionAccountsReturned?: number
        identities?: Pick<IdentityService, 'identitiesLoadedCount'>
    }
): AggregationStats {
    return {
        identitiesFound: resolveIdentitiesFound(fetchResult, options?.identities),
        managedAccountsFound: fetchResult.managedAccountsFound,
        managedAccountsFoundAuthoritative: fetchResult.managedAccountsFoundAuthoritative,
        managedAccountsFoundRecord: fetchResult.managedAccountsFoundRecord,
        managedAccountsFoundOrphan: fetchResult.managedAccountsFoundOrphan,
        fusionAccountsReturned: options?.fusionAccountsReturned,
        totalProcessingTime: timer.totalElapsed(),
        phaseTiming: timer.getPhaseBreakdown(),
    }
}

export function buildReportAggregationStats(
    fetchResult: FetchResult,
    timer: ReturnType<ServiceRegistry['log']['timer']>,
    identities: ServiceRegistry['identities'],
    outputCount?: number
): AggregationStats {
    return fetchResultToAggregationStats(fetchResult, timer, {
        fusionAccountsReturned: outputCount,
        identities,
    })
}

export interface DryRunInput {
    enabled: boolean
    saveFile?: boolean
    sendEmail?: string | string[]
}

export function parseDryRunInput(input: StdAccountListInput): DryRunInput | undefined {
    const dryRun = (input as any)?.dryRun
    if (!dryRun || typeof dryRun !== 'object') return undefined
    const enabled = readBoolean(dryRun, 'enabled', false)
    if (!enabled) return undefined
    const saveFile = readBoolean(dryRun, 'saveFile', false)
    const sendEmail = sanitizeRecipients(normalizeEmailValue(readUnknown(dryRun, 'sendEmail')))
    return { enabled, saveFile, sendEmail: sendEmail.length > 0 ? sendEmail : undefined }
}

export function buildTerminalSummary(
    serviceRegistry: ServiceRegistry,
    result: { outputCount?: number; fetchResult?: FetchResult; timer: ReturnType<ServiceRegistry['log']['timer']> },
    dryRun: DryRunInput
): Record<string, unknown> {
    const { log } = serviceRegistry
    const issueSummary = log.getAggregationIssueSummary()
    return {
        rowsSent: result.outputCount ?? 0,
        identitiesFound: resolveIdentitiesFound(result.fetchResult, serviceRegistry.identities),
        managedAccountsFound: result.fetchResult?.managedAccountsFound ?? 0,
        totalProcessingTime: result.timer.totalElapsed(),
        phaseTiming: result.timer.getPhaseBreakdown(),
        issueSummary,
        options: { saveFile: dryRun.saveFile ?? false, sendEmail: Boolean(dryRun.sendEmail) },
    }
}



