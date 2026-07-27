import { QueuedItemInfo, QueueStats } from '../clientService/types'
import { LogService, PhaseTimer } from './logService'
import {
    EventCounters,
    OperationPhase,
    OperationRunContext,
    CumulativeOutcomes,
    formatCorrelationSummarySegment,
    hasCorrelationActivity,
} from './operationRunContext'

type FusionPendingSnapshot = {
    disableOps: number
    deferredCandidates: number
    /** Active Fusion review form definitions fetched this run (report: Fusion Reviews Found). */
    fusionReviewsFound: number
    /** Fusion review form instances fetched this run (report: Fusion Review Instances Found). */
    fusionReviewInstancesFound: number
    /** Fusion review form definitions created this run. */
    formsCreated: number
    /** Fusion review form instances (reviewer assignments) created this run. */
    formInstancesCreated: number
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

export function formatPhaseEndDetailSuffix(detail?: Record<string, unknown>): string {
    if (!detail || Object.keys(detail).length === 0) return ''
    const parts = Object.entries(detail).map(([k, v]) => {
        if (k === 'correlations') return `correlations ${v}`
        return `${k}=${v}`
    })
    return ` ${parts.join(' ')}`
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

/** Formats an interval-scoped event count (EVENT_SUMMARY), distinct from cumulative STATUS totals. */
function formatIntervalDeltaCount(count: number, intervalMs: number): string {
    return `+${count}/${Math.round(intervalMs / 1000)}s`
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

export function formatMatchOutcomesSegment(outcomes: CumulativeOutcomes, includeTotal = false): string {
    const { nonMatch, formsQueued, autoMerged } = outcomes
    const segment = `matches(${nonMatch}n/${formsQueued}m/${autoMerged}a)`
    if (!includeTotal) return segment
    return `${segment.slice(0, -1)} total=${nonMatch + formsQueued + autoMerged})`
}

export function formatFormOutcomesSegment(formsCreated: number, formInstancesCreated: number): string {
    return `forms=${formsCreated}(${formInstancesCreated})`
}

function shouldShowFormOutcomesInStatus(
    runContext: OperationRunContext,
    pending: FusionPendingSnapshot | undefined
): boolean {
    if (runContext.phase !== 'Process' || !pending) return false
    if (runContext.step === 'form-reconcile') return true
    return pending.formsCreated > 0 || pending.formInstancesCreated > 0
}

function shouldShowMatchOutcomesInStatus(runContext: OperationRunContext): boolean {
    if (runContext.phase !== 'Process') return false
    if (runContext.step === 'uncorrelated-sweep') return true
    const { nonMatch, formsQueued, autoMerged } = runContext.getCumulativeOutcomes()
    return nonMatch + formsQueued + autoMerged > 0
}

function isApiQueueIdle(queueStats: QueueStats): boolean {
    return queueStats.activeRequests === 0 && queueStats.queueLength === 0
}

export function formatApiQueueSegment(
    queueStats: QueueStats,
    previousProcessed: number | undefined,
    intervalMs: number,
    phase: OperationPhase | null
): string | undefined {
    if (phase === 'Refresh' && isApiQueueIdle(queueStats)) {
        return undefined
    }
    const deltaSuffix = formatDeltaSuffix(queueStats.totalProcessed, previousProcessed, intervalMs)
    return `api=${queueStats.activeRequests}a/${queueStats.queueLength}q/${queueStats.totalProcessed}c${deltaSuffix}`
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

    if (shouldShowMatchOutcomesInStatus(runContext)) {
        parts.push(formatMatchOutcomesSegment(runContext.getCumulativeOutcomes()))
    }

    if (shouldShowFormOutcomesInStatus(runContext, fusionPending)) {
        parts.push(formatFormOutcomesSegment(fusionPending!.formsCreated, fusionPending!.formInstancesCreated))
    }

    if (runContext.phase === 'Refresh') {
        parts.push(`refreshed(${runContext.refreshedCount})`)
        const phaseCorrelation = runContext.getPhaseCorrelationCounters()
        if (phaseCorrelation.linkTriggers > 0 || phaseCorrelation.mergeTriggers > 0) {
            const segment = formatCorrelationSummarySegment(phaseCorrelation, { cumulative: true })
            if (segment) parts.push(segment)
        }
    }

    if (queueStats) {
        const apiQueueSegment = formatApiQueueSegment(
            queueStats,
            previousProcessed,
            intervalMs,
            runContext.phase
        )
        if (apiQueueSegment) {
            parts.push(apiQueueSegment)
        }
        if (queueStats.queueLength > 0 && pendingItems && pendingItems.length > 0) {
            parts.push(`queue-pending=${groupActiveLabels(pendingItems)}`)
        }
    }

    const fusionReviewInventory = formatFusionReviewInventory(fusionPending, runContext.phase)
    if (fusionReviewInventory) parts.push(fusionReviewInventory)

    const workPending = formatFusionWorkPending(fusionPending)
    if (workPending) parts.push(workPending)

    if (memory) {
        const heapPct = Math.round((memory.heapUsed / memory.rss) * 100)
        parts.push(`mem=${formatMb(memory.rss)}MB(${heapPct}%)`)
    }

    parts.push(`elapsed=${PhaseTimer.formatElapsed(Date.now() - runContext.operationStartedAt)}`)

    return parts.join(' ')
}

export function formatEventSummaryLines(
    events: EventCounters,
    phase: OperationPhase | null = null,
    intervalMs: number
): string[] {
    const lines: string[] = []
    const inProcessPhase = phase === 'Process'

    if (inProcessPhase) {
        const matchParts: string[] = []
        if (events.nonMatch > 0) {
            matchParts.push(`non-matched=${formatIntervalDeltaCount(events.nonMatch, intervalMs)}`)
        }
        if (events.formsQueued > 0) {
            matchParts.push(`manual=${formatIntervalDeltaCount(events.formsQueued, intervalMs)}`)
        }
        if (events.autoMerged > 0) {
            matchParts.push(`auto=${formatIntervalDeltaCount(events.autoMerged, intervalMs)}`)
        }
        if (matchParts.length > 0) {
            lines.push(`EVENT_SUMMARY matches ${matchParts.join(' ')}`)
        }

        if (events.newIdentityAssignment > 0) {
            lines.push(`EVENT_SUMMARY forms new-identity-assignment=${events.newIdentityAssignment}`)
        }

        if (events.emailSent > 0) {
            lines.push(`EVENT_SUMMARY email=${formatIntervalDeltaCount(events.emailSent, intervalMs)}`)
        }
    }

    if (hasCorrelationActivity(events.correlation)) {
        const segment = formatCorrelationSummarySegment(events.correlation, { intervalMs, cumulative: false })
        if (segment) lines.push(`EVENT_SUMMARY ${segment}`)
    }

    return lines
}

/** Matches pagination suffixes such as `[offset 18500]` or `[page, offset 250]`. */
const OFFSET_LABEL_SUFFIX = /\[(?:page(?: \d+)?, )?offset (\d+)\]$/

const FETCH_ACCOUNTS_LABEL_PREFIX = /^SourceService>fetchAccountsBySourceId(?:Generator)? /

type ParsedQueueLabel =
    | { kind: 'paginated'; base: string; offset: number }
    | { kind: 'plain'; label: string }

function parseQueueLabel(label: string): ParsedQueueLabel {
    const match = label.match(OFFSET_LABEL_SUFFIX)
    if (match && match.index !== undefined) {
        return {
            kind: 'paginated',
            base: label.slice(0, match.index).trimEnd(),
            offset: Number(match[1]),
        }
    }
    return { kind: 'plain', label }
}

function formatPaginatedGroupBase(base: string): string {
    return base.replace(FETCH_ACCOUNTS_LABEL_PREFIX, '')
}

function formatPlainGroupLabel(label: string, count: number): string {
    return count > 1 ? `${label}×${count}` : label
}

export function groupActiveLabels(activeItems: QueuedItemInfo[] | undefined, limit = 3): string {
    if (!activeItems || activeItems.length === 0) return 'none'

    const plainCounts = new Map<string, number>()
    const paginatedOffsets = new Map<string, number[]>()

    for (const item of activeItems) {
        const raw = item.label ?? 'unknown'
        const parsed = parseQueueLabel(raw)
        if (parsed.kind === 'paginated') {
            const offsets = paginatedOffsets.get(parsed.base) ?? []
            offsets.push(parsed.offset)
            paginatedOffsets.set(parsed.base, offsets)
        } else {
            plainCounts.set(parsed.label, (plainCounts.get(parsed.label) ?? 0) + 1)
        }
    }

    type LabelGroup = { text: string; count: number }
    const groups: LabelGroup[] = []

    for (const [label, count] of plainCounts) {
        groups.push({ text: formatPlainGroupLabel(label, count), count })
    }

    for (const [base, offsets] of paginatedOffsets) {
        const sortedOffsets = [...offsets].sort((a, b) => a - b)
        groups.push({
            text: `${formatPaginatedGroupBase(base)} [${sortedOffsets.join(', ')}]`,
            count: offsets.length,
        })
    }

    return groups
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((group) => group.text)
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
    private previousPhase?: OperationPhase | null
    private previousProgressUnit?: string
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
        this.previousPhase = undefined
        this.previousProgressUnit = undefined
        this.zeroDeltaTicks = 0
    }

    private resetProgressBaselineIfContextChanged(runContext: OperationRunContext): void {
        const phase = runContext.phase
        const unit = runContext.progress?.unit
        const phaseChanged = this.previousPhase !== undefined && phase !== this.previousPhase
        const unitChanged = this.previousProgressUnit !== undefined && unit !== this.previousProgressUnit
        const progressReset =
            runContext.progress !== undefined &&
            this.previousProgressDone !== undefined &&
            runContext.progress.done < this.previousProgressDone &&
            !phaseChanged &&
            !unitChanged

        if (phaseChanged || unitChanged || progressReset) {
            this.previousProgressDone = undefined
        }
    }

    tick(): void {
        const snapshot = this.getSnapshot()
        const { runContext, queueStats, activeItems, pendingItems } = snapshot

        this.resetProgressBaselineIfContextChanged(runContext)

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
        for (const line of formatEventSummaryLines(events, runContext.phase, snapshot.intervalMs)) {
            this.log.info(line)
        }

        if (runContext.progress) {
            this.previousProgressDone = runContext.progress.done
        }
        this.previousPhase = runContext.phase
        this.previousProgressUnit = runContext.progress?.unit
        if (queueStats) {
            this.previousProcessed = queueStats.totalProcessed
        }
    }
}

export { formatDetailSuffix }










