import { QueuedItemInfo, QueueStats } from '../clientService/types'
import { LogService, PhaseTimer } from './logService'
import { EventCounters, OperationPhase, OperationRunContext } from './operationRunContext'

type FusionPendingSnapshot = {
    disableOps: number
    deferredCandidates: number
    /** Active Fusion review form definitions fetched this run (report: Fusion Reviews Found). */
    fusionReviewsFound: number
    /** Fusion review form instances fetched this run (report: Fusion Review Instances Found). */
    fusionReviewInstancesFound: number
}

export type HeartbeatSnapshot = {
    runContext: OperationRunContext
    queueStats?: QueueStats
    activeItems?: QueuedItemInfo[]
    pendingItems?: QueuedItemInfo[]
    fusionPending?: FusionPendingSnapshot
    memory?: NodeJS.MemoryUsage
    intervalMs: number
}

export type StatusLineBaselines = {
    previousProcessed?: number
    previousProgressDone?: number
}

function formatMb(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(2)
}

function formatDetailSuffix(detail?: Record<string, unknown>): string {
    if (!detail || Object.keys(detail).length === 0) return ''
    return (
        ' ' +
        Object.entries(detail)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
    )
}

export function formatDeltaSuffix(
    current: number,
    previous: number | undefined,
    intervalMs: number
): string {
    if (previous === undefined) return ''
    const delta = current - previous
    return `(Δ${delta >= 0 ? '+' : ''}${delta}/${Math.round(intervalMs / 1000)}s)`
}

function formatProgressSegment(
    done: number,
    total: number,
    unit: string | undefined,
    previousDone: number | undefined,
    intervalMs: number
): string {
    const fraction = `${done}/${total}`
    const deltaSuffix = formatDeltaSuffix(done, previousDone, intervalMs)
    if (unit) {
        return `progress=${fraction} ${unit}${deltaSuffix}`
    }
    return `progress=${fraction}${deltaSuffix}`
}

export function formatStatusLine(
    snapshot: HeartbeatSnapshot,
    baselines: StatusLineBaselines,
    intervalMs: number
): string {
    const { runContext, queueStats, memory, pendingItems, fusionPending } = snapshot
    const { previousProcessed, previousProgressDone } = baselines
    const parts: string[] = ['STATUS']

    if (runContext.phase) parts.push(`phase=${runContext.phase}`)
    if (runContext.step) parts.push(`step=${runContext.step}`)
    if (runContext.progress) {
        const { done, total, unit } = runContext.progress
        parts.push(formatProgressSegment(done, total, unit, previousProgressDone, intervalMs))
    }

    parts.push(`elapsed=${PhaseTimer.formatElapsed(Date.now() - runContext.operationStartedAt)}`)

    if (queueStats) {
        const deltaSuffix = formatDeltaSuffix(queueStats.totalProcessed, previousProcessed, intervalMs)
        parts.push(
            `api-queue active=${queueStats.activeRequests} queued=${queueStats.queueLength} completed=${queueStats.totalProcessed}${deltaSuffix}`
        )
        if (queueStats.queueLength > 0 && pendingItems && pendingItems.length > 0) {
            parts.push(`queue-pending=${groupActiveLabels(pendingItems)}`)
        }
    }

    const fusionReviewInventory = formatFusionReviewInventory(fusionPending, runContext.phase)
    if (fusionReviewInventory) parts.push(fusionReviewInventory)

    const workPending = formatFusionWorkPending(fusionPending)
    if (workPending) parts.push(workPending)

    if (memory) {
        parts.push(
            `mem rss=${formatMb(memory.rss)}MB heap=${formatMb(memory.heapUsed)}MB`
        )
    }

    return parts.join(' ')
}

export function formatEventSummaryLines(
    events: EventCounters,
    phase: OperationPhase | null = null
): string[] {
    const lines: string[] = []
    const inProcessPhase = phase === 'Process'

    if (inProcessPhase) {
        const matchParts: string[] = []
        if (events.matchExact > 0) matchParts.push(`exact=${events.matchExact}`)
        if (events.matchPartial > 0) matchParts.push(`partial=${events.matchPartial}`)
        if (events.matchDeferred > 0) matchParts.push(`deferred=${events.matchDeferred}`)
        if (matchParts.length > 0) {
            lines.push(`EVENT_SUMMARY matches ${matchParts.join(' ')}`)
        }

        const outcomeParts: string[] = []
        if (events.nonMatch > 0) outcomeParts.push(`nonMatch=${events.nonMatch}`)
        if (events.autoAssigned > 0) outcomeParts.push(`autoAssigned=${events.autoAssigned}`)
        if (events.formsQueued > 0) outcomeParts.push(`formsQueued=${events.formsQueued}`)
        if (events.recordUniqueRegistered > 0) {
            outcomeParts.push(`recordUniqueRegistered=${events.recordUniqueRegistered}`)
        }
        if (outcomeParts.length > 0) {
            lines.push(`EVENT_SUMMARY outcomes ${outcomeParts.join(' ')}`)
        }
    }

    if (events.correlationTriggers > 0) {
        lines.push(
            `EVENT_SUMMARY correlations triggered=${events.correlationTriggers} accounts=${events.correlationAccounts}`
        )
    }

    return lines
}

export function groupActiveLabels(activeItems: QueuedItemInfo[] | undefined, limit = 3): string {
    if (!activeItems || activeItems.length === 0) return 'none'
    const counts = new Map<string, number>()
    for (const item of activeItems) {
        const label = item.label ?? 'unknown'
        counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([label, count]) => `${label}×${count}`)
        .join(', ')
}

function formatFusionReviewInventory(
    pending: FusionPendingSnapshot | undefined,
    phase: OperationPhase | null
): string {
    if (phase !== 'Fetch' || !pending) return ''
    const parts: string[] = []
    if (pending.fusionReviewsFound > 0) parts.push(`fusion-reviews=${pending.fusionReviewsFound}`)
    if (pending.fusionReviewInstancesFound > 0) {
        parts.push(`fusion-review-instances=${pending.fusionReviewInstancesFound}`)
    }
    if (parts.length === 0) return ''
    return parts.join(' ')
}

function formatFusionWorkPending(pending: FusionPendingSnapshot | undefined): string {
    if (!pending) return ''
    const parts: string[] = []
    if (pending.disableOps > 0) parts.push(`disable=${pending.disableOps}`)
    if (pending.deferredCandidates > 0) parts.push(`deferred=${pending.deferredCandidates}`)
    if (parts.length === 0) return ''
    return `work-pending ${parts.join(' ')}`
}

export function formatStallWarning(
    unchangedMs: number,
    activeItems: QueuedItemInfo[] | undefined,
    pendingItems?: QueuedItemInfo[]
): string {
    const pendingSuffix =
        pendingItems && pendingItems.length > 0 ? ` | pending=${groupActiveLabels(pendingItems)}` : ''
    return `WARN STALL api-queue completed unchanged ${Math.round(unchangedMs / 1000)}s | active=${groupActiveLabels(activeItems)}${pendingSuffix}`
}

export class OperationHeartbeat {
    private interval?: ReturnType<typeof setInterval>
    private previousProcessed?: number
    private previousProgressDone?: number
    private zeroDeltaTicks = 0

    constructor(
        private readonly log: LogService,
        private readonly getSnapshot: () => HeartbeatSnapshot
    ) {}

    start(): void {
        if (this.interval) return
        const snapshot = this.getSnapshot()
        this.interval = setInterval(() => this.tick(), snapshot.intervalMs)
    }

    stop(): void {
        if (this.interval === undefined) return
        clearInterval(this.interval)
        this.interval = undefined
        this.previousProcessed = undefined
        this.previousProgressDone = undefined
        this.zeroDeltaTicks = 0
    }

    tick(): void {
        const snapshot = this.getSnapshot()
        const { runContext, queueStats, activeItems, pendingItems } = snapshot

        const statusLine = formatStatusLine(
            snapshot,
            {
                previousProcessed: this.previousProcessed,
                previousProgressDone: this.previousProgressDone,
            },
            snapshot.intervalMs
        )
        const stallDetected =
            queueStats !== undefined &&
            (queueStats.activeRequests > 0 || queueStats.queueLength > 0) &&
            this.previousProcessed !== undefined &&
            queueStats.totalProcessed === this.previousProcessed

        if (stallDetected) {
            this.zeroDeltaTicks++
        } else {
            this.zeroDeltaTicks = 0
        }

        const statusSuffix = this.zeroDeltaTicks >= 2 ? ' | stall=YES' : ''

        if (this.zeroDeltaTicks >= 2) {
            this.log.info(`${statusLine}${statusSuffix}`)
            if (this.zeroDeltaTicks === 2) {
                this.log.warn(
                    formatStallWarning(snapshot.intervalMs * this.zeroDeltaTicks, activeItems, pendingItems)
                )
            }
        } else {
            this.log.info(statusLine)
        }

        const events = runContext.flushEventCounters()
        for (const line of formatEventSummaryLines(events, runContext.phase)) {
            this.log.info(line)
        }

        if (runContext.progress) {
            this.previousProgressDone = runContext.progress.done
        }
        if (queueStats) {
            this.previousProcessed = queueStats.totalProcessed
        }
    }
}

export { formatDetailSuffix }

