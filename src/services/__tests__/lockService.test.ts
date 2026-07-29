import { InMemoryLockService } from '../lockService'
import { LogService } from '../logService'

describe('InMemoryLockService', () => {
    let lockService: InMemoryLockService

    beforeEach(() => {
        lockService = new InMemoryLockService(new LogService({ spConnDebugLoggingEnabled: false }))
    })

    it('serializes concurrent operations on the same key', async () => {
        const order: number[] = []
        const delay = (ms: number, id: number) =>
            lockService.withLock('key-a', async () => {
                order.push(id)
                await new Promise((r) => setTimeout(r, ms))
                order.push(id + 10)
            })

        await Promise.all([delay(20, 1), delay(5, 2)])

        expect(order).toEqual([1, 11, 2, 12])
    })

    it('allows parallel operations on different keys', async () => {
        let inFlight = 0
        let maxInFlight = 0

        const work = (key: string) =>
            lockService.withLock(key, async () => {
                inFlight += 1
                maxInFlight = Math.max(maxInFlight, inFlight)
                await new Promise((r) => setTimeout(r, 10))
                inFlight -= 1
            })

        await Promise.all([work('a'), work('b')])

        expect(maxInFlight).toBe(2)
    })

    it('propagates errors and releases lock for next waiter', async () => {
        await expect(
            lockService.withLock('key', async () => {
                throw new Error('boom')
            })
        ).rejects.toThrow('boom')

        const result = await lockService.withLock('key', async () => 'ok')
        expect(result).toBe('ok')
    })
})
