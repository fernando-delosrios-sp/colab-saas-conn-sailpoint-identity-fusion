import { ApiQueue } from '../queue'
import { QueuePriority } from '../types'

describe('ApiQueue', () => {
    afterEach(() => {
        jest.useRealTimers()
    })

    it('with priority disabled, pre-aborted HIGH request does not leave a stuck item in the queue', async () => {
        jest.useFakeTimers()
        const q = new ApiQueue({
            requestsPerSecond: 1000,
            maxConcurrentRequests: 10,
            maxRetries: 0,
            enablePriority: false,
        })
        const controller = new AbortController()
        controller.abort()

        const p = q.enqueue(() => Promise.resolve(1), {
            priority: QueuePriority.HIGH,
            abortSignal: controller.signal,
        })

        await expect(p).rejects.toThrow('Aborted')
        expect(q.getStats().queueLength).toBe(0)

        q.stop()
        jest.runOnlyPendingTimers()
    })
})
