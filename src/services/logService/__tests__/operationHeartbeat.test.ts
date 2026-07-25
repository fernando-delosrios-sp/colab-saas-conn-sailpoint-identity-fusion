import { OperationRunContext } from '../operationRunContext'
import {
    OperationHeartbeat,
    formatApiQueueSegment,
    formatDeltaSuffix,
    formatEventSummaryLines,
    formatStatusLine,
    formatStallWarning,
    groupActiveLabels,
} from '../operationHeartbeat'
import { LogService, PhaseTimer } from '../logService'

describe('operation heartbeat formatters', () => {
    it('formatDeltaSuffix omits suffix on first tick', () => {
        expect(formatDeltaSuffix(100, undefined, 10_000)).toBe('')
    })

    it('formatDeltaSuffix formats zero and positive deltas', () => {
        expect(formatDeltaSuffix(537, 537, 30_000)).toBe('(Δ+0/30s)')
        expect(formatDeltaSuffix(10296, 7596, 10_000)).toBe('(Δ+2700/10s)')
    })

    it('formatApiQueueSegment uses compact active/queued/completed layout', () => {
        const queueStats = {
            activeRequests: 16,
            queueLength: 0,
            totalProcessed: 398,
            totalFailed: 0,
            totalRetries: 0,
            averageWaitTime: 0,
            averageProcessingTime: 0,
        }
        expect(formatApiQueueSegment(queueStats, 389, 10_000, 'Process')).toBe('api=16/0/398(Δ+9/10s)')
    })

    it('formatApiQueueSegment omits idle queue during Refresh phase', () => {
        const queueStats = {
            activeRequests: 0,
            queueLength: 0,
            totalProcessed: 635,
            totalFailed: 0,
            totalRetries: 0,
            averageWaitTime: 0,
            averageProcessingTime: 0,
        }
        expect(formatApiQueueSegment(queueStats, 635, 10_000, 'Refresh')).toBeUndefined()
        expect(formatApiQueueSegment(queueStats, 635, 10_000, 'Process')).toBe('api=0/0/635(Δ+0/10s)')
    })

    it('formats STATUS with phase, step, progress delta, api-queue delta, and memory', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'
        runContext.step = 'uncorrelated-sweep'
        runContext.progress = { done: 537, total: 800, unit: 'analyzed' }

        vi.advanceTimersByTime(5_000)
        const line = formatStatusLine(
            {
                runContext,
                queueStats: {
                    activeRequests: 10,
                    queueLength: 97,
                    totalProcessed: 537,
                    totalFailed: 0,
                    totalRetries: 0,
                    averageWaitTime: 894,
                    averageProcessingTime: 4733,
                },
                memory: { rss: 505413632, heapUsed: 503316480, heapTotal: 523239424 } as NodeJS.MemoryUsage,
                intervalMs: 30_000,
            },
            { previousProcessed: 537, previousProgressDone: 450 },
            30_000
        )

        expect(line).toContain('STATUS')
        expect(line).toContain('phase=Process')
        expect(line).toContain('step=uncorrelated-sweep')
        expect(line).toContain('progress=537/800 analyzed(Δ+87/30s)')
        expect(line).toContain('api=10/97/537(Δ+0/30s)')
        expect(line).toContain('mem rss=')
        vi.useRealTimers()
    })

    it('omits progress and api-queue deltas on first STATUS tick', () => {
        const runContext = new OperationRunContext()
        runContext.progress = { done: 250, total: 1000, unit: 'fetched' }

        const line = formatStatusLine(
            {
                runContext,
                queueStats: {
                    activeRequests: 2,
                    queueLength: 0,
                    totalProcessed: 12,
                    totalFailed: 0,
                    totalRetries: 0,
                    averageWaitTime: 0,
                    averageProcessingTime: 0,
                },
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).toContain('progress=250/1000 fetched')
        expect(line).not.toContain('progress=250/1000 fetched(Δ')
        expect(line).toContain('api=2/0/12')
        expect(line).not.toContain('api=2/0/12(Δ')
    })

    it('formats STATUS with queue-pending labels and work-pending counts', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'

        const line = formatStatusLine(
            {
                runContext,
                queueStats: {
                    activeRequests: 10,
                    queueLength: 97,
                    totalProcessed: 537,
                    totalFailed: 0,
                    totalRetries: 0,
                    averageWaitTime: 894,
                    averageProcessingTime: 4733,
                },
                pendingItems: [
                    { id: '1', priority: 1, label: 'IdentityService>correlate', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
                    { id: '2', priority: 1, label: 'IdentityService>correlate', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
                    { id: '3', priority: 1, label: 'MatchingService>score', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
                ] as any,
                fusionPending: {
                    disableOps: 2,
                    deferredCandidates: 45,
                    fusionReviewsFound: 143,
                    fusionReviewInstancesFound: 187,
                },
                intervalMs: 30_000,
            },
            {},
            30_000
        )

        expect(line).toContain('queue-pending=IdentityService>correlate×2, MatchingService>score×1')
        expect(line).not.toContain('fusion-reviews=')
        expect(line).toContain('work-pending disable=2 deferred=45')
        vi.useRealTimers()
    })

    it('includes fusion review inventory on STATUS only during Fetch phase', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        const fusionPending = {
            disableOps: 0,
            deferredCandidates: 0,
            fusionReviewsFound: 143,
            fusionReviewInstancesFound: 187,
        }

        const fetchLine = formatStatusLine({ runContext, fusionPending, intervalMs: 10_000 }, {}, 10_000)
        expect(fetchLine).toContain('fusion-reviews=143 fusion-review-instances=187')

        runContext.phase = 'Refresh'
        const refreshLine = formatStatusLine({ runContext, fusionPending, intervalMs: 10_000 }, {}, 10_000)
        expect(refreshLine).not.toContain('fusion-reviews=')
        expect(refreshLine).not.toContain('fusion-review-instances=')
        expect(refreshLine).not.toContain('api=')
    })

    it('omits work-pending when all fusion counts are zero', () => {
        const runContext = new OperationRunContext()
        const line = formatStatusLine(
            {
                runContext,
                fusionPending: {
                    disableOps: 0,
                    deferredCandidates: 0,
                    fusionReviewsFound: 0,
                    fusionReviewInstancesFound: 0,
                },
                intervalMs: 30_000,
            },
            {},
            30_000
        )
        expect(line).not.toContain('work-pending')
    })

    it('formats EVENT_SUMMARY lines for matches and correlations', () => {
        const events = {
            matchExact: 2,
            matchPartial: 12,
            matchDeferred: 3,
            correlationTriggers: 14,
            correlationAccounts: 18,
            nonMatch: 0,
            autoAssigned: 0,
            formsQueued: 0,
            recordUniqueRegistered: 0,
        }
        expect(formatEventSummaryLines(events, 'Process')).toEqual([
            'EVENT_SUMMARY matches exact=2 partial=12 deferred=3',
            'EVENT_SUMMARY correlations triggered=14 accounts=18',
        ])
    })

    it('emits match and outcome EVENT_SUMMARY only during Process phase', () => {
        const events = {
            matchExact: 1,
            matchPartial: 0,
            matchDeferred: 0,
            correlationTriggers: 2,
            correlationAccounts: 3,
            nonMatch: 0,
            autoAssigned: 4,
            formsQueued: 0,
            recordUniqueRegistered: 0,
        }
        expect(formatEventSummaryLines(events, 'Refresh')).toEqual([
            'EVENT_SUMMARY correlations triggered=2 accounts=3',
        ])
        expect(formatEventSummaryLines(events, 'Process')).toEqual([
            'EVENT_SUMMARY matches exact=1',
            'EVENT_SUMMARY outcomes autoAssigned=4',
            'EVENT_SUMMARY correlations triggered=2 accounts=3',
        ])
    })

    it('groups active queue labels', () => {
        const grouped = groupActiveLabels([
            { id: '1', priority: 1, label: 'IdentityService>correlate', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
            { id: '2', priority: 1, label: 'IdentityService>correlate', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
            { id: '3', priority: 1, label: 'MatchingService>score', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
        ] as any)
        expect(grouped).toContain('IdentityService>correlate×2')
        expect(grouped).toContain('MatchingService>score×1')
    })

    it('formats stall warning with active and pending queue labels', () => {
        expect(formatStallWarning(60_000, [])).toBe('WARN STALL api-queue completed unchanged 60s | active=none')
        expect(
            formatStallWarning(60_000, [], [
                { id: '1', priority: 1, label: 'FormService>create', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
            ] as any)
        ).toBe('WARN STALL api-queue completed unchanged 60s | active=none | pending=FormService>create×1')
    })
})

describe('PhaseTimer in STATUS elapsed', () => {
    it('uses uppercase duration units', () => {
        expect(PhaseTimer.formatElapsed(1500)).toBe('1.5S')
    })
})

describe('OperationHeartbeat timing', () => {
    it('emits STATUS on first tick at 10 second interval', () => {
        vi.useFakeTimers()
        const info = vi.fn()
        const log = { info } as unknown as LogService
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'

        const heartbeat = new OperationHeartbeat(log, () => ({
            runContext,
            intervalMs: 10_000,
        }))

        heartbeat.start()
        expect(info).not.toHaveBeenCalled()

        vi.advanceTimersByTime(10_000)

        expect(info).toHaveBeenCalledTimes(1)
        expect(info.mock.calls[0][0]).toContain('STATUS')

        heartbeat.stop()
        vi.useRealTimers()
    })

    it('does not emit WARN STALL when pipeline progress advances but api-queue is idle', () => {
        vi.useFakeTimers()
        const info = vi.fn()
        const warn = vi.fn()
        const log = { info, warn } as unknown as LogService
        const runContext = new OperationRunContext()
        runContext.phase = 'Refresh'
        runContext.progress = { done: 7596, total: 18495, unit: 'processed' }

        const heartbeat = new OperationHeartbeat(log, () => ({
            runContext,
            queueStats: {
                activeRequests: 0,
                queueLength: 0,
                totalProcessed: 635,
                totalFailed: 0,
                totalRetries: 0,
                averageWaitTime: 0,
                averageProcessingTime: 0,
            },
            intervalMs: 10_000,
        }))

        heartbeat.start()
        vi.advanceTimersByTime(10_000)
        runContext.progress = { done: 10296, total: 18495, unit: 'processed' }
        vi.advanceTimersByTime(10_000)
        runContext.progress = { done: 13008, total: 18495, unit: 'processed' }
        vi.advanceTimersByTime(10_000)

        expect(warn).not.toHaveBeenCalled()
        expect(info.mock.calls[2][0]).toContain('progress=13008/18495 processed(Δ+2712/10s)')
        expect(info.mock.calls[2][0]).not.toContain('api=')

        heartbeat.stop()
        vi.useRealTimers()
    })

    it('formats Fetch phase STATUS with fetched progress delta', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.progress = { done: 1200, total: 5000, unit: 'fetched' }

        const line = formatStatusLine(
            {
                runContext,
                queueStats: {
                    activeRequests: 4,
                    queueLength: 12,
                    totalProcessed: 80,
                    totalFailed: 0,
                    totalRetries: 0,
                    averageWaitTime: 0,
                    averageProcessingTime: 0,
                },
                intervalMs: 10_000,
            },
            { previousProgressDone: 800, previousProcessed: 50 },
            10_000
        )

        expect(line).toContain('phase=Fetch')
        expect(line).toContain('progress=1200/5000 fetched(Δ+400/10s)')
        expect(line).toContain('api=4/12/80(Δ+30/10s)')
    })

    it('shows independent non-zero pipeline and api-queue deltas during Fetch', () => {
        vi.useFakeTimers()
        const info = vi.fn()
        const log = { info } as unknown as LogService
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.progress = { done: 500, total: 2000, unit: 'fetched' }

        let queueProcessed = 10
        const heartbeat = new OperationHeartbeat(log, () => ({
            runContext,
            queueStats: {
                activeRequests: 2,
                queueLength: 3,
                totalProcessed: queueProcessed,
                totalFailed: 0,
                totalRetries: 0,
                averageWaitTime: 0,
                averageProcessingTime: 0,
            },
            intervalMs: 10_000,
        }))

        heartbeat.start()
        vi.advanceTimersByTime(10_000)

        runContext.progress = { done: 900, total: 2000, unit: 'fetched' }
        queueProcessed = 25
        vi.advanceTimersByTime(10_000)

        expect(info.mock.calls[1][0]).toContain('progress=900/2000 fetched(Δ+400/10s)')
        expect(info.mock.calls[1][0]).toContain('api=2/3/25(Δ+15/10s)')

        heartbeat.stop()
        vi.useRealTimers()
    })

    it('shows page-sized fetch progress deltas between heartbeat ticks', () => {
        vi.useFakeTimers()
        const info = vi.fn()
        const log = { info } as unknown as LogService
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.progress = { done: 500, total: 101_561, unit: 'fetched' }

        const heartbeat = new OperationHeartbeat(log, () => ({
            runContext,
            queueStats: {
                activeRequests: 10,
                queueLength: 0,
                totalProcessed: 120,
                totalFailed: 0,
                totalRetries: 0,
                averageWaitTime: 0,
                averageProcessingTime: 0,
            },
            intervalMs: 10_000,
        }))

        heartbeat.start()
        vi.advanceTimersByTime(10_000)

        runContext.progress = { done: 750, total: 101_561, unit: 'fetched' }
        vi.advanceTimersByTime(10_000)

        const secondStatus = info.mock.calls[1][0] as string
        expect(secondStatus).toContain('progress=750/101561 fetched(Δ+250/10s)')
        expect(secondStatus).not.toContain('Δ+2500/10s')

        heartbeat.stop()
        vi.useRealTimers()
    })
})



