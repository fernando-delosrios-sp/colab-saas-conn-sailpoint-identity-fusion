import { OperationRunContext } from '../operationRunContext'
import { formatEventSummaryLines, formatStatusLine, formatStallWarning, groupActiveLabels } from '../operationHeartbeat'
import { PhaseTimer } from '../logService'

describe('operation heartbeat formatters', () => {
    it('formats STATUS with phase, step, progress, queue delta, and memory', () => {
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
            537,
            30_000
        )

        expect(line).toContain('STATUS')
        expect(line).toContain('phase=Process')
        expect(line).toContain('step=uncorrelated-sweep')
        expect(line).toContain('progress=537/800')
        expect(line).toContain('processed=537(Δ+0/30s)')
        expect(line).toContain('mem rss=')
        vi.useRealTimers()
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
                    formCandidates: 12,
                    reviewUrls: 5,
                    deferredCandidates: 45,
                },
                intervalMs: 30_000,
            },
            undefined,
            30_000
        )

        expect(line).toContain('queue-pending=IdentityService>correlate×2, MatchingService>score×1')
        expect(line).toContain('work-pending disable=2 candidates=12 reviews=5 deferred=45')
        vi.useRealTimers()
    })

    it('omits work-pending when all fusion counts are zero', () => {
        const runContext = new OperationRunContext()
        const line = formatStatusLine(
            {
                runContext,
                fusionPending: {
                    disableOps: 0,
                    formCandidates: 0,
                    reviewUrls: 0,
                    deferredCandidates: 0,
                },
                intervalMs: 30_000,
            },
            undefined,
            30_000
        )
        expect(line).not.toContain('work-pending')
    })

    it('formats EVENT_SUMMARY lines for matches and correlations', () => {
        const lines = formatEventSummaryLines({
            matchExact: 2,
            matchPartial: 12,
            matchDeferred: 3,
            correlationTriggers: 14,
            correlationAccounts: 18,
            nonMatch: 0,
            autoAssigned: 0,
            formsQueued: 0,
        })
        expect(lines).toEqual([
            'EVENT_SUMMARY matches exact=2 partial=12 deferred=3',
            'EVENT_SUMMARY correlations triggered=14 accounts=18',
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
        expect(formatStallWarning(60_000, [])).toBe('WARN STALL queue processed unchanged 60s | active=none')
        expect(
            formatStallWarning(60_000, [], [
                { id: '1', priority: 1, label: 'FormService>create', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
            ] as any)
        ).toBe('WARN STALL queue processed unchanged 60s | active=none | pending=FormService>create×1')
    })
})

describe('PhaseTimer in STATUS elapsed', () => {
    it('uses uppercase duration units', () => {
        expect(PhaseTimer.formatElapsed(1500)).toBe('1.5S')
    })
})

