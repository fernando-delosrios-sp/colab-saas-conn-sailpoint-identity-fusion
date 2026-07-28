import { StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { readBoolean, readUnknown } from '../../utils/safeRead'
import { normalizeEmailValue, sanitizeRecipients } from '../../services/emailService/email'
import { IdentityService } from '../../services/identityService'
import type { FetchResult } from './accountListPhases'

export function resolveIdentitiesFound(
    fetchResult: FetchResult | undefined,
    identities?: Pick<IdentityService, 'identitiesLoadedCount'>
): number {
    const fetchCount = fetchResult?.identitiesFound ?? 0
    const loadedCount = identities?.identitiesLoadedCount ?? fetchCount
    return Math.max(fetchCount, loadedCount)
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


