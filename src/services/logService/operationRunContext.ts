export type OperationPhase = 'Setup' | 'Fetch' | 'Refresh' | 'Process' | 'Output' | 'Epilogue'

type MatchEventType = 'exact' | 'partial' | 'deferred'
type DecisionEventType = 'newIdentity' | 'merge' | 'noMatch' | 'autoMerge'

export type CorrelationSkipReason = 'noIdentity' | 'noSourceContext' | 'wrongMode' | 'noIscAccountId'

export type CorrelationActivityCounters = {
    linkTriggers: number
    linkAccounts: number
    mergeTriggers: number
    mergeAccounts: number
    linkCompleted: number
    mergeCompleted: number
    correlatedAction: number
    skippedNoIdentity: number
    skippedNoSourceContext: number
    skippedWrongMode: number
    skippedNoIscAccountId: number
}

export type EventCounters = {
    matchExact: number
    matchPartial: number
    matchDeferred: number
    correlation: CorrelationActivityCounters
    nonMatch: number
    autoMerged: number
    formsQueued: number
    newIdentityAssignment: number
    decisionNewIdentity: number
    decisionMerge: number
    decisionNoMatch: number
    decisionAutoMerge: number
    recordUniqueRegistered: number
    emailSent: number
}

/** Cumulative match outcomes for STATUS lines (not reset on heartbeat flush). */
export type CumulativeOutcomes = {
    nonMatch: number
    autoMerged: number
    formsQueued: number
    deferred: number
    decisionNewIdentity: number
    decisionMerge: number
    decisionNoMatch: number
    decisionAutoMerge: number
}

type ProgressSnapshot = {
    done: number
    total: number
    unit?: string
}

export function createEmptyCorrelationActivityCounters(): CorrelationActivityCounters {
    return {
        linkTriggers: 0,
        linkAccounts: 0,
        mergeTriggers: 0,
        mergeAccounts: 0,
        linkCompleted: 0,
        mergeCompleted: 0,
        correlatedAction: 0,
        skippedNoIdentity: 0,
        skippedNoSourceContext: 0,
        skippedWrongMode: 0,
        skippedNoIscAccountId: 0,
    }
}

export function createEmptyEventCounters(): EventCounters {
    return {
        matchExact: 0,
        matchPartial: 0,
        matchDeferred: 0,
        correlation: createEmptyCorrelationActivityCounters(),
        nonMatch: 0,
        autoMerged: 0,
        formsQueued: 0,
        newIdentityAssignment: 0,
        decisionNewIdentity: 0,
        decisionMerge: 0,
        decisionNoMatch: 0,
        decisionAutoMerge: 0,
        recordUniqueRegistered: 0,
        emailSent: 0,
    }
}

export function createEmptyCumulativeOutcomes(): CumulativeOutcomes {
    return {
        nonMatch: 0,
        autoMerged: 0,
        formsQueued: 0,
        deferred: 0,
        decisionNewIdentity: 0,
        decisionMerge: 0,
        decisionNoMatch: 0,
        decisionAutoMerge: 0,
    }
}

function incrementCorrelationActivity(
    counters: CorrelationActivityCounters,
    kind: 'link' | 'merge',
    accounts: number
): void {
    if (kind === 'link') {
        counters.linkTriggers++
        counters.linkAccounts += accounts
    } else {
        counters.mergeTriggers++
        counters.mergeAccounts += accounts
    }
}

function incrementCorrelationCompleted(
    counters: CorrelationActivityCounters,
    kind: 'link' | 'merge',
    count: number
): void {
    if (kind === 'link') {
        counters.linkCompleted += count
    } else {
        counters.mergeCompleted += count
    }
}

function incrementCorrelationSkipped(counters: CorrelationActivityCounters, reason: CorrelationSkipReason): void {
    switch (reason) {
        case 'noIdentity':
            counters.skippedNoIdentity++
            break
        case 'noSourceContext':
            counters.skippedNoSourceContext++
            break
        case 'wrongMode':
            counters.skippedWrongMode++
            break
        case 'noIscAccountId':
            counters.skippedNoIscAccountId++
            break
    }
}

export function hasCorrelationActivity(counters: CorrelationActivityCounters): boolean {
    return (
        counters.linkTriggers > 0 ||
        counters.linkAccounts > 0 ||
        counters.mergeTriggers > 0 ||
        counters.mergeAccounts > 0 ||
        counters.linkCompleted > 0 ||
        counters.mergeCompleted > 0 ||
        counters.correlatedAction > 0 ||
        counters.skippedNoIdentity > 0 ||
        counters.skippedNoSourceContext > 0 ||
        counters.skippedWrongMode > 0 ||
        counters.skippedNoIscAccountId > 0
    )
}

/**
 * Mutable run state consumed by the operation heartbeat and updated via LogService helpers.
 */
export class OperationRunContext {
    readonly operationStartedAt: number
    /** When true, correlation summary formatters omit correlated-action segments (account-list aggregation). */
    excludeCorrelatedActionInSummaries = false
    phase: OperationPhase | null = null
    step: string | null = null
    progress?: ProgressSnapshot
    stepStartedAt?: number
    phaseStartedAt?: number
    epilogueStartedAt?: number
    private events: EventCounters = createEmptyEventCounters()
    private cumulativeOutcomes: CumulativeOutcomes = createEmptyCumulativeOutcomes()
    private phaseCorrelation: CorrelationActivityCounters = createEmptyCorrelationActivityCounters()
    /** Run-scoped correlation counters (not reset at phase boundaries). */
    private runCorrelation: CorrelationActivityCounters = createEmptyCorrelationActivityCounters()

    constructor(startedAt: number = Date.now()) {
        this.operationStartedAt = startedAt
    }

    recordEvent(category: string, detail?: Record<string, unknown>): void {
        switch (category) {
            case 'match': {
                const type = detail?.type as MatchEventType | undefined
                if (type === 'exact') this.events.matchExact++
                else if (type === 'deferred') {
                    this.events.matchDeferred++
                    this.cumulativeOutcomes.deferred++
                } else this.events.matchPartial++
                break
            }
            case 'correlation': {
                const accounts = typeof detail?.accounts === 'number' ? detail.accounts : 0
                this.recordCorrelationActivity({ kind: 'link', accounts })
                break
            }
            case 'nonMatch':
                this.events.nonMatch++
                this.cumulativeOutcomes.nonMatch++
                break
            case 'autoMerged':
                this.events.autoMerged++
                this.cumulativeOutcomes.autoMerged++
                break
            case 'formsQueued':
                this.events.formsQueued++
                this.cumulativeOutcomes.formsQueued++
                break
            case 'newIdentityAssignment':
                this.events.newIdentityAssignment++
                break
            case 'decision': {
                const type = detail?.type as DecisionEventType | undefined
                if (type === 'newIdentity') {
                    this.events.decisionNewIdentity++
                    this.cumulativeOutcomes.decisionNewIdentity++
                } else if (type === 'merge') {
                    this.events.decisionMerge++
                    this.cumulativeOutcomes.decisionMerge++
                } else if (type === 'noMatch') {
                    this.events.decisionNoMatch++
                    this.cumulativeOutcomes.decisionNoMatch++
                } else if (type === 'autoMerge') {
                    this.events.decisionAutoMerge++
                    this.cumulativeOutcomes.decisionAutoMerge++
                }
                break
            }
            case 'recordUniqueRegistered': {
                const count = detail?.count
                if (typeof count === 'number') {
                    this.events.recordUniqueRegistered += count
                }
                break
            }
            case 'emailSent':
                this.events.emailSent++
                break
            default:
                break
        }
    }

    recordCorrelationActivity(params: { kind: 'link' | 'merge'; accounts: number }): void {
        incrementCorrelationActivity(this.events.correlation, params.kind, params.accounts)
        incrementCorrelationActivity(this.phaseCorrelation, params.kind, params.accounts)
        incrementCorrelationActivity(this.runCorrelation, params.kind, params.accounts)
    }

    recordCorrelationCompleted(params: { kind: 'link' | 'merge'; count?: number }): void {
        const count = params.count ?? 1
        incrementCorrelationCompleted(this.events.correlation, params.kind, count)
        incrementCorrelationCompleted(this.phaseCorrelation, params.kind, count)
        incrementCorrelationCompleted(this.runCorrelation, params.kind, count)
    }

    recordCorrelatedActionGranted(): void {
        this.events.correlation.correlatedAction++
        this.phaseCorrelation.correlatedAction++
    }

    recordCorrelationSkipped(reason: CorrelationSkipReason): void {
        incrementCorrelationSkipped(this.events.correlation, reason)
        incrementCorrelationSkipped(this.phaseCorrelation, reason)
    }

    /** Returns a copy of counters and resets the accumulator for the next heartbeat tick. */
    flushEventCounters(): EventCounters {
        const snapshot = {
            ...this.events,
            correlation: { ...this.events.correlation },
        }
        this.events = createEmptyEventCounters()
        return snapshot
    }

    peekEventCounters(): EventCounters {
        return {
            ...this.events,
            correlation: { ...this.events.correlation },
        }
    }

    getCumulativeOutcomes(): CumulativeOutcomes {
        return { ...this.cumulativeOutcomes }
    }

    resetCumulativeOutcomes(): void {
        this.cumulativeOutcomes = createEmptyCumulativeOutcomes()
    }

    getPhaseCorrelationCounters(): CorrelationActivityCounters {
        return { ...this.phaseCorrelation }
    }

    getRunCorrelationCounters(): CorrelationActivityCounters {
        return { ...this.runCorrelation }
    }

    resetPhaseCorrelationCounters(): void {
        this.phaseCorrelation = createEmptyCorrelationActivityCounters()
    }

    flushPhaseCorrelationSummary(): Record<string, unknown> | undefined {
        if (!hasCorrelationActivity(this.phaseCorrelation)) return undefined
        const segment = formatCorrelationSummaryValue(this.phaseCorrelation, {
            cumulative: true,
            excludeCorrelatedAction: this.excludeCorrelatedActionInSummaries,
        })
        this.resetPhaseCorrelationCounters()
        return { correlations: segment }
    }
}

/** Value portion for PHASE END / DETAIL (without leading `correlations` label). */
export function formatCorrelationSummaryValue(
    counters: CorrelationActivityCounters,
    options?: { intervalMs?: number; cumulative?: boolean; excludeCorrelatedAction?: boolean }
): string {
    const parts: string[] = []

    if (counters.linkTriggers > 0 || counters.linkAccounts > 0) {
        parts.push(`link=${counters.linkTriggers}/${counters.linkAccounts}`)
    }
    if (counters.mergeTriggers > 0 || counters.mergeAccounts > 0) {
        parts.push(`merge=${counters.mergeTriggers}/${counters.mergeAccounts}`)
    }
    const totalCompleted = counters.linkCompleted + counters.mergeCompleted
    if (totalCompleted > 0) {
        if (options?.intervalMs && !options?.cumulative) {
            parts.push(`completed=+${totalCompleted}/${Math.round(options.intervalMs / 1000)}s`)
        } else {
            parts.push(`completed=${totalCompleted}`)
        }
    }
    if (counters.correlatedAction > 0 && !options?.excludeCorrelatedAction) {
        if (options?.intervalMs && !options?.cumulative) {
            parts.push(
                `correlated-action=+${counters.correlatedAction}/${Math.round(options.intervalMs / 1000)}s`
            )
        } else {
            parts.push(`correlated-action=${counters.correlatedAction}`)
        }
    }

    const skippedParts: string[] = []
    if (counters.skippedNoIdentity > 0) skippedParts.push(`noIdentity=${counters.skippedNoIdentity}`)
    if (counters.skippedNoSourceContext > 0) {
        skippedParts.push(`noSourceContext=${counters.skippedNoSourceContext}`)
    }
    if (counters.skippedWrongMode > 0) skippedParts.push(`wrongMode=${counters.skippedWrongMode}`)
    if (counters.skippedNoIscAccountId > 0) {
        skippedParts.push(`noIscAccountId=${counters.skippedNoIscAccountId}`)
    }
    if (skippedParts.length > 0) {
        parts.push(`skipped=${skippedParts.join(',')}`)
    }

    return parts.join(' ')
}

export function formatCorrelationSummarySegment(
    counters: CorrelationActivityCounters,
    options?: { intervalMs?: number; cumulative?: boolean; excludeCorrelatedAction?: boolean }
): string {
    const value = formatCorrelationSummaryValue(counters, options)
    if (!value) return ''
    return `correlations ${value}`
}






