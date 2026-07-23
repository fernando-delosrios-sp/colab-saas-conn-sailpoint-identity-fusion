import { StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { readBoolean, readArray } from '../../utils/safeRead'
import { sanitizeRecipients } from '../../services/emailService/email'

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
    const rawEmail = (readArray(dryRun, 'sendEmail', []) as (string | undefined)[])
        .filter((e): e is string => typeof e === 'string')
    const sendEmail = sanitizeRecipients(rawEmail)
    return { enabled, saveFile, sendEmail: sendEmail.length > 0 ? sendEmail : undefined }
}

export function buildTerminalSummary(
    serviceRegistry: ServiceRegistry,
    result: { outputCount?: number; fetchResult?: { identitiesFound: number; managedAccountsFound: number }; timer: ReturnType<ServiceRegistry['log']['timer']> },
    dryRun: DryRunInput
): Record<string, unknown> {
    const { log } = serviceRegistry
    const issueSummary = log.getAggregationIssueSummary()
    return {
        rowsSent: result.outputCount ?? 0,
        identitiesFound: result.fetchResult?.identitiesFound ?? 0,
        managedAccountsFound: result.fetchResult?.managedAccountsFound ?? 0,
        totalProcessingTime: result.timer.totalElapsed(),
        phaseTiming: result.timer.getPhaseBreakdown(),
        issueSummary,
        options: { saveFile: dryRun.saveFile ?? false, sendEmail: Boolean(dryRun.sendEmail) },
    }
}
