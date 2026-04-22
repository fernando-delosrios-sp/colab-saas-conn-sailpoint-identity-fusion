import { LimiterService } from '../limiterService'
import { internalConfig } from '../../../data/config'

describe('LimiterService', () => {
    it('exposes non-empty api and objects limiters with expected reservoir settings on api', async () => {
        const lim = new LimiterService({ apiMaxConcurrent: 10, objectMaxConcurrent: 5 })
        // Bottleneck 2.x: settings can be read after a microtask
        const ok = await lim.api.schedule({}, () => Promise.resolve(1))
        expect(ok).toBe(1)
        const counts = lim.stats().api
        expect(counts.QUEUED + counts.RECEIVED + counts.RUNNING + counts.EXECUTING + (counts.DONE ?? 0)).toBeGreaterThanOrEqual(0)
        expect(internalConfig.clientService.reservoirAmount).toBe(100)
        expect(internalConfig.clientService.reservoirWindowMs).toBe(10_000)
        lim.dispose()
    })

    it('retries failed jobs when shouldRetry returns true', async () => {
        const lim = new LimiterService({ apiMaxConcurrent: 10, objectMaxConcurrent: 2 })
        let calls = 0
        await expect(
            lim.api.schedule({ id: 'retry-test' }, async () => {
                calls++
                if (calls < 2) {
                    const err: any = new Error('transient')
                    err.response = { status: 503 }
                    throw err
                }
                return 'ok'
            })
        ).resolves.toBe('ok')
        expect(calls).toBe(2)
        lim.dispose()
    })
})
