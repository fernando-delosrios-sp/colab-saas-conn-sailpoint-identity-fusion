import { compact, promiseAllBatched, forEachBatched, getScoringMaxConcurrency, batchProcess } from '../collections'
import { yieldToEventLoop } from '../../../utils/yieldToEventLoop'
import type { FusionConfig } from '../../../model/config'
import type { LogService } from '../../logService'

describe('collections utilities', () => {
    describe('compact', () => {
        it('should filter out null and undefined values', () => {
            const array = [1, null, 2, undefined, 3, null]
            expect(compact(array)).toEqual([1, 2, 3])
        })

        it('should keep falsy values other than null and undefined', () => {
            const array = [0, '', false, null, undefined]
            expect(compact(array)).toEqual([0, '', false])
        })

        it('should return an empty array if all elements are null or undefined', () => {
            const array = [null, undefined, null]
            expect(compact(array)).toEqual([])
        })
    })

    describe('yieldToEventLoop', () => {
        it('should resolve using setImmediate', async () => {
            const originalSetImmediate = global.setImmediate

            // Mock setImmediate to track if it's called
            const setImmediateMock = vi.fn((cb) => {
                originalSetImmediate(cb)
            })
            global.setImmediate = setImmediateMock as any

            await yieldToEventLoop()

            expect(setImmediateMock).toHaveBeenCalled()

            global.setImmediate = originalSetImmediate
        })
    })

    describe('promiseAllBatched', () => {
        it('should process an empty array', async () => {
            const fn = vi.fn()
            const result = await promiseAllBatched([], fn)
            expect(result).toEqual([])
            expect(fn).not.toHaveBeenCalled()
        })

        it('should process items smaller than batch size', async () => {
            const items = [1, 2, 3]
            const fn = vi.fn(async (item) => item * 2)
            const onBatchComplete = vi.fn()

            const result = await promiseAllBatched(items, fn, 5, onBatchComplete)

            expect(result).toEqual([2, 4, 6])
            expect(fn).toHaveBeenCalledTimes(3)
            expect(onBatchComplete).toHaveBeenCalledTimes(1)
            expect(onBatchComplete).toHaveBeenCalledWith(3, 3)
        })

        it('should process items in multiple batches', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = vi.fn(async (item) => item * 2)
            const onBatchComplete = vi.fn()

            const result = await promiseAllBatched(items, fn, 2, onBatchComplete)

            expect(result).toEqual([2, 4, 6, 8, 10])
            expect(fn).toHaveBeenCalledTimes(5)
            expect(onBatchComplete).toHaveBeenCalledTimes(3)
            expect(onBatchComplete).toHaveBeenNthCalledWith(1, 2, 5)
            expect(onBatchComplete).toHaveBeenNthCalledWith(2, 4, 5)
            expect(onBatchComplete).toHaveBeenNthCalledWith(3, 5, 5)
        })
    })

    describe('batchProcess', () => {
        it('uses processed as the default progress unit', async () => {
            const setProgress = vi.fn()
            const log = { setProgress } as unknown as LogService

            await batchProcess([1, 2], 'items', async (item) => item, {} as FusionConfig, log, 1)

            expect(setProgress).toHaveBeenLastCalledWith(2, 2, 'processed')
        })

        it('uses an explicit refreshed progress unit', async () => {
            const setProgress = vi.fn()
            const log = { setProgress } as unknown as LogService

            await batchProcess([1, 2], 'items', async (item) => item, {} as FusionConfig, log, 1, 'refreshed')

            expect(setProgress).toHaveBeenLastCalledWith(2, 2, 'refreshed')
        })
    })

    describe('getScoringMaxConcurrency', () => {
        it('defaults to 12 when unset', () => {
            expect(getScoringMaxConcurrency({} as FusionConfig)).toBe(12)
        })

        it('returns configured value within bounds', () => {
            expect(getScoringMaxConcurrency({ scoringMaxConcurrency: 5 } as FusionConfig)).toBe(5)
        })

        it('clamps low values to 1', () => {
            expect(getScoringMaxConcurrency({ scoringMaxConcurrency: 0 } as FusionConfig)).toBe(1)
        })

        it('clamps high values to 50', () => {
            expect(getScoringMaxConcurrency({ scoringMaxConcurrency: 200 } as FusionConfig)).toBe(50)
        })
    })

    describe('forEachBatched', () => {
        it('should process an empty iterable and return zero', async () => {
            const fn = vi.fn()
            const onProgress = vi.fn()

            const result = await forEachBatched([], fn, 2, onProgress)

            expect(result).toBe(0)
            expect(fn).not.toHaveBeenCalled()
            expect(onProgress).not.toHaveBeenCalled()
        })

        it('should process items smaller than batch size', async () => {
            const items = [1, 2, 3]
            const fn = vi.fn(async () => {})

            const result = await forEachBatched(items, fn, 5)

            expect(result).toBe(3)
            expect(fn).toHaveBeenCalledTimes(3)
        })

        it('should process items in multiple batches and return the completion count', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = vi.fn(async () => {})

            const result = await forEachBatched(items, fn, 2)

            expect(result).toBe(5)
            expect(fn).toHaveBeenCalledTimes(5)
        })

        it('should stream directly from a Map iterator without materializing an array', async () => {
            const source = new Map<string, number>([
                ['a', 1],
                ['b', 2],
                ['c', 3],
            ])
            const seen: number[] = []

            const result = await forEachBatched(source.values(), async (value) => {
                seen.push(value)
            }, 2)

            expect(result).toBe(3)
            expect(seen).toEqual([1, 2, 3])
        })

        it('should report cumulative progress after each batch', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = vi.fn(async () => {})
            const onProgress = vi.fn()

            await forEachBatched(items, fn, 2, onProgress)

            expect(onProgress).toHaveBeenCalledTimes(3)
            expect(onProgress).toHaveBeenNthCalledWith(1, 2)
            expect(onProgress).toHaveBeenNthCalledWith(2, 4)
            expect(onProgress).toHaveBeenNthCalledWith(3, 5)
        })

        it('should propagate a rejection and stop processing later batches', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = vi.fn(async (item: number) => {
                if (item === 3) throw new Error('boom')
            })

            await expect(forEachBatched(items, fn, 2)).rejects.toThrow('boom')
            // The first batch (1, 2) completed and the second batch (3, 4) was started
            // before the rejection surfaced; item 5 was never pulled from the iterator.
            expect(fn).toHaveBeenCalledTimes(4)
            expect(fn).not.toHaveBeenCalledWith(5)
        })
    })
})

