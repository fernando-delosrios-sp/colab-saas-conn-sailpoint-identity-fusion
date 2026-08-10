import { FusionDecision } from '../../model/form'
import { SourceType } from '../../model/config'
import { LogService } from '../logService'
import { trimStr } from '../../utils/safeRead'

export type DecisionEventType = 'newIdentity' | 'merge' | 'noMatch' | 'autoMerge'

type DecisionLogPhase = 'discovered' | 'applied'

export type DecisionApplyOutcome =
    | 'registered'
    | 'merged'
    | 'reused-target'
    | 'dropped-orphan'
    | 'dropped-record'

export type DecisionCounts = {
    newIdentity: number
    merge: number
    noMatch: number
    autoMerge: number
}

type DecisionLogOptions = {
    phase: DecisionLogPhase
    outcome?: DecisionApplyOutcome
    debugSuffix?: string
}

function resolveReviewerLabel(decision: FusionDecision): string {
    const id = trimStr(decision.submitter?.id)
    const name = trimStr(decision.submitter?.name)
    const email = trimStr(decision.submitter?.email)
    if (name && name !== id) return name
    if (email) return email
    if (decision.automaticMerge) return 'System (automatic merge)'
    return id ?? 'Unknown reviewer'
}

function resolveMergeTargetLabel(decision: FusionDecision): string {
    const id = trimStr(decision.identityId)
    const name = trimStr(decision.identityName)
    if (name && name !== id) return name
    return id ?? 'existing identity'
}

export function resolveDecisionEventType(decision: FusionDecision): DecisionEventType {
    if (decision.automaticMerge) return 'autoMerge'
    if (decision.newIdentity) {
        const sourceType = decision.sourceType ?? SourceType.Authoritative
        if (sourceType === SourceType.Record || sourceType === SourceType.Orphan) {
            return 'noMatch'
        }
        return 'newIdentity'
    }
    return 'merge'
}

function formatAccountLabel(decision: FusionDecision): string {
    return `${decision.account.name} [${decision.account.sourceName}]`
}

const DECISION_HEADLINES: Record<DecisionEventType, string> = {
    autoMerge: 'AUTO-MERGE DECISION',
    noMatch: 'NO-MATCH DECISION',
    newIdentity: 'NEW IDENTITY DECISION',
    merge: 'MERGE DECISION',
}

const OUTCOME_SUFFIXES: Record<DecisionApplyOutcome, string> = {
    registered: ' → registered as fusion account',
    merged: ' → merged into target identity',
    'reused-target': ' → applied to existing fusion account',
    'dropped-orphan': ' → dropped (orphan no-match)',
    'dropped-record': ' → registered unique attributes only (record no-match)',
}

/** Builds the primary decision log line (headline + account + reviewer/target context). */
export function formatFusionDecisionLog(decision: FusionDecision, options: DecisionLogOptions): string {
    const accountLabel = formatAccountLabel(decision)
    const reviewer = resolveReviewerLabel(decision)
    const eventType = resolveDecisionEventType(decision)
    const headline = DECISION_HEADLINES[eventType]
    const phaseLabel = options.phase === 'discovered' ? ' DISCOVERED' : ' APPLIED'

    let summary: string
    if (eventType === 'autoMerge' || eventType === 'merge') {
        const target = resolveMergeTargetLabel(decision)
        summary = `${accountLabel} → ${target} by ${reviewer}`
    } else if (eventType === 'noMatch') {
        const sourceType = decision.sourceType ?? SourceType.Authoritative
        summary = `${accountLabel} by ${reviewer} (${sourceType})`
    } else {
        summary = `${accountLabel} by ${reviewer}`
    }

    const outcomeSuffix = options.phase === 'applied' && options.outcome ? OUTCOME_SUFFIXES[options.outcome] : ''
    const debugSuffix = options.debugSuffix ?? ''
    return `${headline}${phaseLabel}: ${summary}${outcomeSuffix}${debugSuffix}`
}

function formatDecisionDebugDetails(decision: FusionDecision): string {
    return (
        ` key=${decision.account.id}` +
        ` identityId=${decision.identityId ?? 'none'}` +
        ` finished=${decision.finished}` +
        (decision.comments ? ` comments="${decision.comments}"` : '')
    )
}

type DecisionLogger = Pick<LogService, 'recordEvent' | 'getLogLevel' | 'debug' | 'info'>

/** Log a finished decision parsed from a review form (Fetch phase). */
export function logFusionDecisionDiscovered(log: DecisionLogger, decision: FusionDecision): void {
    const message = formatFusionDecisionLog(decision, { phase: 'discovered' })
    log.info(message)
    if (log.getLogLevel() === 'debug') {
        log.debug(`${message}${formatDecisionDebugDetails(decision)}`)
    }
}

/** Log a decision taking effect and record run metrics (Refresh / Process phases). */
export function logFusionDecisionApplied(
    log: DecisionLogger,
    decision: FusionDecision,
    outcome: DecisionApplyOutcome
): void {
    const eventType = resolveDecisionEventType(decision)
    log.recordEvent('decision', { type: eventType })
    // Preserve legacy counter used by existing heartbeat tests.
    if (eventType === 'newIdentity') {
        log.recordEvent('newIdentityAssignment')
    }

    const message = formatFusionDecisionLog(decision, { phase: 'applied', outcome })
    log.info(message)
    if (log.getLogLevel() === 'debug') {
        log.debug(`${message}${formatDecisionDebugDetails(decision)}`)
    }
}

export function summarizeDecisionCounts(decisions: ReadonlyArray<FusionDecision>): DecisionCounts {
    const counts: DecisionCounts = { newIdentity: 0, merge: 0, noMatch: 0, autoMerge: 0 }
    for (const decision of decisions) {
        const type = resolveDecisionEventType(decision)
        counts[type]++
    }
    return counts
}

/** Formats decision counters for DETAIL / STATUS lines, mirroring match outcome segments. */
export function formatDecisionCountsSegment(counts: DecisionCounts, includeTotal = false): string {
    const segment = `decisions(${counts.newIdentity}n/${counts.merge}m/${counts.noMatch}nm/${counts.autoMerge}a)`
    if (!includeTotal) return segment
    const total = counts.newIdentity + counts.merge + counts.noMatch + counts.autoMerge
    return `${segment.slice(0, -1)} total=${total})`
}
