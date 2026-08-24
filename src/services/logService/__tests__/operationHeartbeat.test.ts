import {
    OperationRunContext,
    createEmptyEventCounters,
    formatCorrelationSummarySegment,
} from '../operationRunContext'
import {
    OperationHeartbeat,
    countCorrelationQueuePending,
    formatApiQueueSegment,
    formatDeltaSuffix,
    formatEventSummaryLines,
    formatFormOutcomesSegment,
    formatMatchOutcomesSegment,
    formatPhaseEndDetailSuffix,
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
            rateLimitWaitCount: 0,
            totalProcessed: 398,
            totalFailed: 0,
            totalRetries: 0,
            averageWaitTime: 0,
            averageProcessingTime: 0,
        }
        expect(formatApiQueueSegment(queueStats, 389, 10_000, 'Process')).toBe('api=16a/0q/398c(Δ+9/10s)')
    })

    it('formatApiQueueSegment omits idle queue during Refresh phase', () => {
        const queueStats = {
            activeRequests: 0,
            queueLength: 0,
            rateLimitWaitCount: 0,
            totalProcessed: 635,
            totalFailed: 0,
            totalRetries: 0,
            averageWaitTime: 0,
            averageProcessingTime: 0,
        }
        expect(formatApiQueueSegment(queueStats, 635, 10_000, 'Refresh')).toBeUndefined()
        expect(formatApiQueueSegment(queueStats, 635, 10_000, 'Process')).toBe('api=0a/0q/635c(Δ+0/10s)')
    })

    it('formatApiQueueSegment includes rateLimitWaitCount in q when FIFO is empty', () => {
        const queueStats = {
            activeRequests: 0,
            queueLength: 0,
            rateLimitWaitCount: 49,
            totalProcessed: 389,
            totalFailed: 0,
            totalRetries: 0,
            averageWaitTime: 0,
            averageProcessingTime: 0,
        }
        expect(formatApiQueueSegment(queueStats, 389, 10_000, 'Process')).toBe('api=0a/49q/389c(Δ+0/10s)')
    })

    it('formats STATUS with phase, step, progress delta, api-queue delta, and memory', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'
        runContext.step = 'uncorrelated-sweep'
        runContext.progress = { done: 537, total: 800, unit: 'analyzed' }
        runContext.recordEvent('nonMatch')
        runContext.recordEvent('nonMatch')
        runContext.recordEvent('formsQueued')
        runContext.recordEvent('autoMerged')

        vi.advanceTimersByTime(5_000)
        const line = formatStatusLine(
            {
                runContext,
                queueStats: {
                    activeRequests: 10,
                    queueLength: 97,
                    rateLimitWaitCount: 0,
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
        expect(line).toContain('matches(2n/1m/1a/0d)')
        expect(line).toContain('api=10a/97q/537c(Δ+0/30s)')
        expect(line).toContain('mem=482.00MB(100%)')
        expect(line.endsWith(' elapsed=5.0S')).toBe(true)
        vi.useRealTimers()
    })

    it('formatMatchOutcomesSegment includes total when requested', () => {
        expect(formatMatchOutcomesSegment({ nonMatch: 58, formsQueued: 30, autoMerged: 4, deferred: 12 })).toBe(
            'matches(58n/30m/4a/12d)'
        )
        expect(formatMatchOutcomesSegment({ nonMatch: 58, formsQueued: 30, autoMerged: 4, deferred: 12 }, true)).toBe(
            'matches(58n/30m/4a/12d total=104)'
        )
    })

    it('formatFormOutcomesSegment renders forms count with instances in parentheses', () => {
        expect(formatFormOutcomesSegment(12, 36)).toBe('forms=12(36)')
        expect(formatFormOutcomesSegment(73, 73)).toBe('forms=73(73)')
    })

    it('includes form outcomes on STATUS during form-reconcile', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'
        runContext.step = 'form-reconcile'

        const line = formatStatusLine(
            {
                runContext,
                fusionPending: {
                    fusionReviewsFound: 0,
                    fusionReviewInstancesFound: 0,
                    formsCreated: 12,
                    formInstancesCreated: 36,
                },
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).toContain('forms=12(36)')
    })

    it('includes form outcomes on STATUS during Process when forms were created', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'
        runContext.step = 'uncorrelated-sweep'

        const line = formatStatusLine(
            {
                runContext,
                fusionPending: {
                    fusionReviewsFound: 0,
                    fusionReviewInstancesFound: 0,
                    formsCreated: 3,
                    formInstancesCreated: 9,
                },
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).toContain('forms=3(9)')
    })

    it('omits form outcomes from STATUS outside Process phase', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'

        const line = formatStatusLine(
            {
                runContext,
                fusionPending: {
                    fusionReviewsFound: 0,
                    fusionReviewInstancesFound: 0,
                    formsCreated: 5,
                    formInstancesCreated: 10,
                },
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).not.toContain('forms=')
    })

    it('omits match outcomes from STATUS outside Process phase', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.recordEvent('nonMatch')

        const line = formatStatusLine({ runContext, intervalMs: 10_000 }, {}, 10_000)
        expect(line).not.toContain('matches(')
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
                    rateLimitWaitCount: 0,
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
        expect(line).toContain('api=2a/0q/12c')
        expect(line).not.toContain('api=2a/0q/12c(Δ')
    })

    it('formats STATUS with queue-pending labels', () => {
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
                    rateLimitWaitCount: 0,
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
                    fusionReviewsFound: 143,
                    fusionReviewInstancesFound: 187,
                    formsCreated: 0,
                    formInstancesCreated: 0,
                },
                intervalMs: 30_000,
            },
            {},
            30_000
        )

        expect(line).toContain('queue-pending=IdentityService>correlate×2, MatchingService>score')
        expect(line).not.toContain('fusion-reviews=')
        expect(line).not.toContain('work-pending')
        vi.useRealTimers()
    })

    it('includes fusion review inventory on STATUS only during Fetch phase', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        const fusionPending = {
            fusionReviewsFound: 143,
            fusionReviewInstancesFound: 187,
            formsCreated: 0,
            formInstancesCreated: 0,
        }

        const fetchLine = formatStatusLine({ runContext, fusionPending, intervalMs: 10_000 }, {}, 10_000)
        expect(fetchLine).toContain('fusion-reviews=143 fusion-review-instances=187')

        runContext.phase = 'Refresh'
        const refreshLine = formatStatusLine({ runContext, fusionPending, intervalMs: 10_000 }, {}, 10_000)
        expect(refreshLine).not.toContain('fusion-reviews=')
        expect(refreshLine).not.toContain('fusion-review-instances=')
        expect(refreshLine).not.toContain('api=')
    })

    it('omits EVENT_SUMMARY matches when the interval only has non-matched outcomes', () => {
        const events = createEmptyEventCounters()
        events.nonMatch = 225

        expect(formatEventSummaryLines(events, 'Process', 10_000)).toEqual([])
    })

    it('keeps EVENT_SUMMARY matches when the interval includes review or merge outcomes', () => {
        const events = createEmptyEventCounters()
        events.nonMatch = 220
        events.formsQueued = 5

        expect(formatEventSummaryLines(events, 'Process', 10_000)).toEqual([
            'EVENT_SUMMARY matches non-matched=+220/10s manual=+5/10s',
        ])
    })

    it('still emits EVENT_SUMMARY decisions when matches are only non-matched', () => {
        const events = createEmptyEventCounters()
        events.nonMatch = 225
        events.decisionMerge = 1

        expect(formatEventSummaryLines(events, 'Process', 10_000)).toEqual([
            'EVENT_SUMMARY decisions merge=+1/10s',
        ])
    })

    it('formats EVENT_SUMMARY lines for matches and correlations', () => {
        const events = {
            matchExact: 2,
            matchPartial: 12,
            matchDeferred: 3,
            correlation: {
                linkTriggers: 14,
                linkAccounts: 18,
                mergeTriggers: 0,
                mergeAccounts: 0,
                linkCompleted: 0,
                mergeCompleted: 0,
                correlatedAction: 0,
                skippedNoIdentity: 0,
                skippedNoSourceContext: 0,
                skippedWrongMode: 0,
                skippedNoIscAccountId: 0,
            },
            nonMatch: 0,
            autoMerged: 0,
            formsQueued: 0,
            newIdentityAssignment: 0,
            recordUniqueRegistered: 0,
            emailSent: 0,
        }
        expect(formatEventSummaryLines(events, 'Process', 10_000)).toEqual([
            'EVENT_SUMMARY matches deferred=+3/10s',
            'EVENT_SUMMARY correlations link=14/18',
        ])
    })

    it('formats EVENT_SUMMARY line for email sends during Process phase', () => {
        const events = {
            matchExact: 0,
            matchPartial: 0,
            matchDeferred: 0,
            correlation: {
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
            },
            nonMatch: 0,
            autoMerged: 0,
            formsQueued: 0,
            newIdentityAssignment: 0,
            recordUniqueRegistered: 0,
            emailSent: 3,
        }
        expect(formatEventSummaryLines(events, 'Process', 10_000)).toEqual(['EVENT_SUMMARY email=+3/10s'])
        expect(formatEventSummaryLines(events, 'Refresh', 10_000)).toEqual([])
    })

    it('emits match and outcome EVENT_SUMMARY only during Process phase', () => {
        const events = {
            matchExact: 1,
            matchPartial: 0,
            matchDeferred: 3,
            correlation: {
                linkTriggers: 2,
                linkAccounts: 3,
                mergeTriggers: 0,
                mergeAccounts: 0,
                linkCompleted: 0,
                mergeCompleted: 0,
                correlatedAction: 0,
                skippedNoIdentity: 0,
                skippedNoSourceContext: 0,
                skippedWrongMode: 0,
                skippedNoIscAccountId: 0,
            },
            nonMatch: 5,
            autoMerged: 4,
            formsQueued: 2,
            newIdentityAssignment: 1,
            recordUniqueRegistered: 0,
            emailSent: 0,
        }
        expect(formatEventSummaryLines(events, 'Refresh', 10_000)).toEqual([
            'EVENT_SUMMARY correlations link=2/3',
        ])
        expect(formatEventSummaryLines(events, 'Process', 10_000)).toEqual([
            'EVENT_SUMMARY matches non-matched=+5/10s manual=+2/10s auto=+4/10s deferred=+3/10s',
            'EVENT_SUMMARY forms new-identity-assignment=1',
            'EVENT_SUMMARY correlations link=2/3',
        ])
    })

    it('groups active queue labels', () => {
        const grouped = groupActiveLabels([
            { id: '1', priority: 1, label: 'IdentityService>correlate', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
            { id: '2', priority: 1, label: 'IdentityService>correlate', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
            { id: '3', priority: 1, label: 'MatchingService>score', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
        ] as any)
        expect(grouped).toContain('IdentityService>correlate×2')
        expect(grouped).toContain('MatchingService>score')
    })

    it('aggregates correlateAccounts labels with per-account suffixes', () => {
        const item = {
            priority: 1,
            createdAt: 0,
            retryCount: 0,
            maxRetries: 3,
            waitTimeMs: 100,
        }
        const grouped = groupActiveLabels([
            { ...item, id: '1', label: 'IdentityService>correlateAccounts 768daab640cd4c51b2ebe5441b76fda8::SF0000950' },
            { ...item, id: '2', label: 'IdentityService>correlateAccounts 768daab640cd4c51b2ebe5441b76fda8::SF0001005' },
            { ...item, id: '3', label: 'IdentityService>correlateAccounts 768daab640cd4c51b2ebe5441b76fda8::SF0000748' },
        ] as any)
        expect(grouped).toBe('IdentityService>correlateAccounts×3')
    })

    it('groups paginated queue labels by source with offsets instead of ×1', () => {
        const item = {
            priority: 1,
            createdAt: 0,
            retryCount: 0,
            maxRetries: 3,
            waitTimeMs: 100,
        }
        const grouped = groupActiveLabels([
            {
                ...item,
                id: '1',
                label: 'SourceService>fetchAccountsBySourceIdGenerator Identity Fusion NG [offset 18500]',
            },
            {
                ...item,
                id: '2',
                label: 'SourceService>fetchAccountsBySourceIdGenerator Identity Fusion NG [offset 18750]',
            },
            {
                ...item,
                id: '3',
                label: 'SourceService>fetchAccountsBySourceIdGenerator Workday - Employees [offset 18000]',
            },
        ] as any)

        expect(grouped).toBe(
            'Identity Fusion NG [18500, 18750], Workday - Employees [18000]'
        )
    })

    it('formats stall warning with active and pending queue labels', () => {
        expect(formatStallWarning(60_000, [])).toBe('WARN STALL api-queue completed unchanged 60s | active=none')
        expect(
            formatStallWarning(60_000, [], [
                { id: '1', priority: 1, label: 'FormService>create', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 100 },
            ] as any)
        ).toBe('WARN STALL api-queue completed unchanged 60s | active=none | pending=FormService>create')
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

    it('omits progress delta on first STATUS tick after phase change', () => {
        vi.useFakeTimers()
        const info = vi.fn()
        const log = { info } as unknown as LogService
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.progress = { done: 18311, total: 18811, unit: 'fetched' }

        const heartbeat = new OperationHeartbeat(log, () => ({
            runContext,
            intervalMs: 10_000,
        }))

        heartbeat.start()
        vi.advanceTimersByTime(10_000)
        runContext.phase = 'Refresh'
        runContext.progress = { done: 6468, total: 18811, unit: 'processed' }
        runContext.refreshedCount = 6454
        vi.advanceTimersByTime(10_000)

        const refreshStatusLine = info.mock.calls[1][0] as string
        expect(refreshStatusLine).toContain('phase=Refresh')
        expect(refreshStatusLine).toContain('progress=6468/18811 processed')
        expect(refreshStatusLine).not.toMatch(/processed\(Δ-/)
        expect(refreshStatusLine).not.toContain('processed(Δ')

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
        runContext.refreshedCount = 280

        const heartbeat = new OperationHeartbeat(log, () => ({
            runContext,
            queueStats: {
                activeRequests: 0,
                queueLength: 0,
                rateLimitWaitCount: 0,
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
        runContext.refreshedCount = 390
        vi.advanceTimersByTime(10_000)
        runContext.progress = { done: 13008, total: 18495, unit: 'processed' }
        runContext.refreshedCount = 500
        vi.advanceTimersByTime(10_000)

        expect(warn).not.toHaveBeenCalled()
        expect(info.mock.calls[2][0]).toContain('progress=13008/18495 processed(Δ+2712/10s)')
        expect(info.mock.calls[2][0]).toContain('refreshed(500)')
        expect(info.mock.calls[2][0]).not.toContain('api=')

        heartbeat.stop()
        vi.useRealTimers()
    })

    it('shows cumulative refreshed count during Refresh phase STATUS', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Refresh'
        runContext.progress = { done: 13548, total: 18811, unit: 'processed' }
        runContext.refreshedCount = 500

        const line = formatStatusLine(
            {
                runContext,
                memory: { rss: 642_777_088, heapUsed: 353_370_112, heapTotal: 419_430_400, external: 0, arrayBuffers: 0 },
                intervalMs: 10_000,
            },
            { previousProgressDone: 7296 },
            10_000
        )

        expect(line).toContain('phase=Refresh')
        expect(line).toContain('progress=13548/18811 processed(Δ+6252/10s)')
        expect(line).toContain('refreshed(500)')
    })

    it('includes correlation segment on Refresh STATUS when link activity occurred', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Refresh'
        runContext.refreshedCount = 120
        runContext.recordCorrelationActivity({ kind: 'link', accounts: 8 })

        const line = formatStatusLine(
            {
                runContext,
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).toContain('refreshed(120)')
        expect(line).toContain('correlations link=1/8')
    })

    it('formatCorrelationSummarySegment emits link, merge, completed, correlated-action, and skipped segments', () => {
        const segment = formatCorrelationSummarySegment(
            {
                linkTriggers: 14,
                linkAccounts: 18,
                mergeTriggers: 2,
                mergeAccounts: 2,
                linkCompleted: 10,
                mergeCompleted: 2,
                correlatedAction: 12,
                skippedNoIdentity: 0,
                skippedNoSourceContext: 0,
                skippedWrongMode: 0,
                skippedNoIscAccountId: 3,
            },
            { intervalMs: 10_000, cumulative: false }
        )
        expect(segment).toBe(
            'correlations link=14/18 merge=2/2 completed=+12/10s correlated-action=+12/10s skipped=noIscAccountId=3'
        )
    })

    it('includes correlation drain segment on Output STATUS when PATCHes are pending', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Output'
        runContext.recordCorrelationActivity({ kind: 'link', accounts: 2000 })
        runContext.recordCorrelationCompleted({ kind: 'link', count: 147 })

        const line = formatStatusLine(
            {
                runContext,
                correlationQueuePending: 1853,
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).toContain('correlations link=1/2000 completed=147 pending=1853')
    })

    it('includes correlation drain segment on Epilogue STATUS when PATCHes are pending', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Epilogue'
        runContext.recordCorrelationActivity({ kind: 'link', accounts: 2000 })
        runContext.recordCorrelationCompleted({ kind: 'link', count: 147 })

        const line = formatStatusLine(
            {
                runContext,
                correlationQueuePending: 1853,
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).toContain('phase=Epilogue')
        expect(line).toContain('correlations link=1/2000 completed=147 pending=1853')
    })

    it('omits correlation drain segment outside Output and Epilogue phases', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'
        runContext.recordCorrelationActivity({ kind: 'link', accounts: 2000 })
        runContext.recordCorrelationCompleted({ kind: 'link', count: 147 })

        const line = formatStatusLine(
            {
                runContext,
                correlationQueuePending: 1853,
                intervalMs: 10_000,
            },
            {},
            10_000
        )

        expect(line).not.toContain('pending=1853')
        expect(line).not.toContain('completed=147')
    })

    it('countCorrelationQueuePending counts correlateAccounts labels only', () => {
        const pendingItems = [
            { id: '1', priority: 1, label: 'IdentityService>correlateAccounts', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 0 },
            { id: '2', priority: 1, label: 'IdentityService>correlateAccounts acct-1', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 0 },
            { id: '3', priority: 1, label: 'MatchingService>score', createdAt: 0, retryCount: 0, maxRetries: 3, waitTimeMs: 0 },
        ] as any

        expect(countCorrelationQueuePending(pendingItems)).toBe(2)
        expect(countCorrelationQueuePending(undefined)).toBe(0)
        expect(countCorrelationQueuePending([])).toBe(0)
    })

    it('EVENT_SUMMARY includes completed interval delta for correlation PATCHes', () => {
        const lines = formatEventSummaryLines(
            {
                matchExact: 0,
                matchPartial: 0,
                matchDeferred: 0,
                correlation: {
                    linkTriggers: 0,
                    linkAccounts: 0,
                    mergeTriggers: 0,
                    mergeAccounts: 0,
                    linkCompleted: 147,
                    mergeCompleted: 0,
                    correlatedAction: 0,
                    skippedNoIdentity: 0,
                    skippedNoSourceContext: 0,
                    skippedWrongMode: 0,
                    skippedNoIscAccountId: 0,
                },
                nonMatch: 0,
                autoMerged: 0,
                formsQueued: 0,
                newIdentityAssignment: 0,
                recordUniqueRegistered: 0,
                emailSent: 0,
            },
            'Output',
            10_000
        )

        expect(lines).toContain('EVENT_SUMMARY correlations completed=+147/10s')
    })

    it('formatPhaseEndDetailSuffix renders correlations without key=value prefix', () => {
        expect(formatPhaseEndDetailSuffix({ correlations: 'link=42/56 merge=2/2' })).toBe(
            ' correlations link=42/56 merge=2/2'
        )
    })

    it('omits refreshed segment outside Refresh phase', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Process'
        runContext.progress = { done: 100, total: 200, unit: 'processed' }
        runContext.refreshedCount = 50

        const line = formatStatusLine(
            { runContext, intervalMs: 10_000 },
            {},
            10_000
        )

        expect(line).not.toContain('refreshed(')
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
                    rateLimitWaitCount: 0,
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
        expect(line).toContain('api=4a/12q/80c(Δ+30/10s)')
    })

    it('formats ingested progress on STATUS with its interval delta', () => {
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.progress = { done: 4000, total: 10_000, unit: 'ingested' }

        const line = formatStatusLine(
            { runContext, intervalMs: 10_000 },
            { previousProgressDone: 2500 },
            10_000
        )

        expect(line).toContain('progress=4000/10000 ingested(Δ+1500/10s)')
        expect(line).not.toContain('INGEST')
    })

    it('resets the progress delta when STATUS changes from fetched to ingested', () => {
        vi.useFakeTimers()
        const info = vi.fn()
        const log = { info } as unknown as LogService
        const runContext = new OperationRunContext()
        runContext.phase = 'Fetch'
        runContext.progress = { done: 500, total: 2000, unit: 'fetched' }
        const heartbeat = new OperationHeartbeat(log, () => ({ runContext, intervalMs: 10_000 }))

        heartbeat.start()
        vi.advanceTimersByTime(10_000)
        runContext.progress = { done: 250, total: 2000, unit: 'ingested' }
        vi.advanceTimersByTime(10_000)
        runContext.progress = { done: 750, total: 2000, unit: 'ingested' }
        vi.advanceTimersByTime(10_000)

        expect(info.mock.calls[1][0]).toContain('progress=250/2000 ingested')
        expect(info.mock.calls[1][0]).not.toContain('ingested(Δ')
        expect(info.mock.calls[2][0]).toContain('progress=750/2000 ingested(Δ+500/10s)')

        heartbeat.stop()
        vi.useRealTimers()
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
                rateLimitWaitCount: 0,
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
        expect(info.mock.calls[1][0]).toContain('api=2a/3q/25c(Δ+15/10s)')

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
                rateLimitWaitCount: 0,
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











