import { mapValuesToArray, compact, yieldToEventLoop, promiseAllBatched, forEachBatched } from '../collections'

describe('collections utilities', () => {
    describe('mapValuesToArray', () => {
        it('should return an empty array for an empty map', () => {
            const map = new Map<string, number>()
            expect(mapValuesToArray(map)).toEqual([])
        })

        it('should return an array of values for a populated map', () => {
            const map = new Map<string, number>([
                ['a', 1],
                ['b', 2],
                ['c', 3],
            ])
            expect(mapValuesToArray(map)).toEqual([1, 2, 3])
        })
    })

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
            const setImmediateMock = jest.fn((cb) => {
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
            const fn = jest.fn()
            const result = await promiseAllBatched([], fn)
            expect(result).toEqual([])
            expect(fn).not.toHaveBeenCalled()
        })

        it('should process items smaller than batch size', async () => {
            const items = [1, 2, 3]
            const fn = jest.fn(async (item) => item * 2)
            const onBatchComplete = jest.fn()

            const result = await promiseAllBatched(items, fn, 5, onBatchComplete)

            expect(result).toEqual([2, 4, 6])
            expect(fn).toHaveBeenCalledTimes(3)
            expect(onBatchComplete).toHaveBeenCalledTimes(1)
            expect(onBatchComplete).toHaveBeenCalledWith(3, 3)
        })

        it('should process items in multiple batches', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = jest.fn(async (item) => item * 2)
            const onBatchComplete = jest.fn()

            const result = await promiseAllBatched(items, fn, 2, onBatchComplete)

            expect(result).toEqual([2, 4, 6, 8, 10])
            expect(fn).toHaveBeenCalledTimes(5)
            expect(onBatchComplete).toHaveBeenCalledTimes(3)
            expect(onBatchComplete).toHaveBeenNthCalledWith(1, 2, 5)
            expect(onBatchComplete).toHaveBeenNthCalledWith(2, 4, 5)
            expect(onBatchComplete).toHaveBeenNthCalledWith(3, 5, 5)
        })
    })

    describe('forEachBatched', () => {
        it('should process an empty array', async () => {
            const fn = jest.fn()
            await forEachBatched([], fn)
            expect(fn).not.toHaveBeenCalled()
        })

        it('should process items smaller than batch size', async () => {
            const items = [1, 2, 3]
            const fn = jest.fn(async () => {})

            await forEachBatched(items, fn, 5)

            expect(fn).toHaveBeenCalledTimes(3)
        })

        it('should process items in multiple batches', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = jest.fn(async () => {})

            await forEachBatched(items, fn, 2)

            expect(fn).toHaveBeenCalledTimes(5)
        })
    })
})
