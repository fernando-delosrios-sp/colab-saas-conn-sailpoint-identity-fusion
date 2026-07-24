import { QueuedItemInfo, QueueStats } from '../clientService/types'
import { LogService, PhaseTimer } from './logService'
import { EventCounters, OperationRunContext } from './operationRunContext'

export type HeartbeatSnapshot = {
    runContext: OperationRunContext
    queueStats?: QueueStats
    activeItems?: QueuedItemInfo[]
    memory?: NodeJS.MemoryUsage
    intervalMs: number
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

export function formatStatusLine(
    snapshot: HeartbeatSnapshot,
    previousProcessed: number | undefined,
    intervalMs: number
): string {
    const { runContext, queueStats, memory } = snapshot
    const parts: string[] = ['STATUS']

    if (runContext.phase) parts.push(`phase=${runContext.phase}`)
    if (runContext.step) parts.push(`step=${runContext.step}`)
    if (runContext.progress) {
        const { done, total } = runContext.progress
        parts.push(`progress=${done}/${total}`)
    }

    parts.push(`elapsed=${PhaseTimer.formatElapsed(Date.now() - runContext.operationStartedAt)}`)

    if (queueStats) {
        const delta =
            previousProcessed === undefined ? undefined : queueStats.totalProcessed - previousProcessed
        const deltaSuffix =
            delta === undefined ? '' : `(Δ${delta >= 0 ? '+' : ''}${delta}/${Math.round(intervalMs / 1000)}s)`
        parts.push(
            `queue active=${queueStats.activeRequests} queued=${queueStats.queueLength} processed=${queueStats.totalProcessed}${deltaSuffix}`
        )
    }

    if (memory) {
        parts.push(
            `mem rss=${formatMb(memory.rss)}MB heap=${formatMb(memory.heapUsed)}MB`
        )
    }

    return parts.join(' ')
}

export function formatEventSummaryLines(events: EventCounters): string[] {
    const lines: string[] = []
    const matchParts: string[] = []
    if (events.matchExact > 0) matchParts.push(`exact=${events.matchExact}`)
    if (events.matchPartial > 0) matchParts.push(`partial=${events.matchPartial}`)
    if (events.matchDeferred > 0) matchParts.push(`deferred=${events.matchDeferred}`)
    if (matchParts.length > 0) {
        lines.push(`EVENT_SUMMARY matches ${matchParts.join(' ')}`)
    }

    if (events.correlationTriggers > 0) {
        lines.push(
            `EVENT_SUMMARY correlations triggered=${events.correlationTriggers} accounts=${events.correlationAccounts}`
        )
    }

    const outcomeParts: string[] = []
    if (events.nonMatch > 0) outcomeParts.push(`nonMatch=${events.nonMatch}`)
    if (events.autoAssigned > 0) outcomeParts.push(`autoAssigned=${events.autoAssigned}`)
    if (events.formsQueued > 0) outcomeParts.push(`formsQueued=${events.formsQueued}`)
    if (outcomeParts.length > 0) {
        lines.push(`EVENT_SUMMARY outcomes ${outcomeParts.join(' ')}`)
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

export function formatStallWarning(
    unchangedMs: number,
    activeItems: QueuedItemInfo[] | undefined
): string {
    return `WARN STALL queue processed unchanged ${Math.round(unchangedMs / 1000)}s | active=${groupActiveLabels(activeItems)}`
}

export class OperationHeartbeat {
    private interval?: ReturnType<typeof setInterval>
    private previousProcessed?: number
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
        this.zeroDeltaTicks = 0
    }

    tick(): void {
        const snapshot = this.getSnapshot()
        const { runContext, queueStats, activeItems } = snapshot

        const statusLine = formatStatusLine(snapshot, this.previousProcessed, snapshot.intervalMs)
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
                    formatStallWarning(snapshot.intervalMs * this.zeroDeltaTicks, activeItems)
                )
            }
        } else {
            this.log.info(statusLine)
        }

        const events = runContext.flushEventCounters()
        for (const line of formatEventSummaryLines(events)) {
            this.log.info(line)
        }

        if (queueStats) {
            this.previousProcessed = queueStats.totalProcessed
        }
    }
}

export { formatDetailSuffix }
