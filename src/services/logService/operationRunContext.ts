export type OperationPhase = 'Setup' | 'Fetch' | 'Refresh' | 'Process' | 'Output' | 'Epilogue'

type MatchEventType = 'exact' | 'partial' | 'deferred'

export type EventCounters = {
    matchExact: number
    matchPartial: number
    matchDeferred: number
    correlationTriggers: number
    correlationAccounts: number
    nonMatch: number
    autoMerged: number
    formsQueued: number
    newIdentityAssignment: number
    recordUniqueRegistered: number
    emailSent: number
}

/** Cumulative match outcomes for STATUS lines (not reset on heartbeat flush). */
export type CumulativeOutcomes = {
    nonMatch: number
    autoMerged: number
    formsQueued: number
}

type ProgressSnapshot = {
    done: number
    total: number
    unit?: string
}

export function createEmptyEventCounters(): EventCounters {
    return {
        matchExact: 0,
        matchPartial: 0,
        matchDeferred: 0,
        correlationTriggers: 0,
        correlationAccounts: 0,
        nonMatch: 0,
        autoMerged: 0,
        formsQueued: 0,
        newIdentityAssignment: 0,
        recordUniqueRegistered: 0,
        emailSent: 0,
    }
}

function createEmptyCumulativeOutcomes(): CumulativeOutcomes {
    return { nonMatch: 0, autoMerged: 0, formsQueued: 0 }
}

/**
 * Mutable run state consumed by the operation heartbeat and updated via LogService helpers.
 */
export class OperationRunContext {
    readonly operationStartedAt: number
    phase: OperationPhase | null = null
    step: string | null = null
    progress?: ProgressSnapshot
    stepStartedAt?: number
    phaseStartedAt?: number
    epilogueStartedAt?: number
    /** Cumulative fusion accounts with needsRefresh during the Refresh phase. */
    refreshedCount = 0
    private events: EventCounters = createEmptyEventCounters()
    private cumulativeOutcomes: CumulativeOutcomes = createEmptyCumulativeOutcomes()

    constructor(startedAt: number = Date.now()) {
        this.operationStartedAt = startedAt
    }

    recordEvent(category: string, detail?: Record<string, unknown>): void {
        switch (category) {
            case 'match': {
                const type = detail?.type as MatchEventType | undefined
                if (type === 'exact') this.events.matchExact++
                else if (type === 'deferred') this.events.matchDeferred++
                else this.events.matchPartial++
                break
            }
            case 'correlation': {
                this.events.correlationTriggers++
                const accounts = detail?.accounts
                if (typeof accounts === 'number') {
                    this.events.correlationAccounts += accounts
                }
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

    /** Returns a copy of counters and resets the accumulator for the next heartbeat tick. */
    flushEventCounters(): EventCounters {
        const snapshot = { ...this.events }
        this.events = createEmptyEventCounters()
        return snapshot
    }

    peekEventCounters(): EventCounters {
        return { ...this.events }
    }

    getCumulativeOutcomes(): CumulativeOutcomes {
        return { ...this.cumulativeOutcomes }
    }

    resetCumulativeOutcomes(): void {
        this.cumulativeOutcomes = createEmptyCumulativeOutcomes()
    }

    incrementRefreshedCount(): void {
        this.refreshedCount++
    }
}



