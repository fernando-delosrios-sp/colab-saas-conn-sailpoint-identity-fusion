import { mapValuesToArray, compact, yieldToEventLoop, promiseAllBatched, forEachBatched } from '../collections'

describe('collections utilities', () => {
    describe('mapValuesToArray', () => {
        it('should return an empty array for an empty map', () => {
            const map = new Map<string, number>()
            expect(mapValuesToArray(map)).toEqual([])
        })

        it('should return an array of values for a populated map', () => {
            const map = new Map<string, number>()
            map.set('a', 1)
            map.set('b', 2)
            expect(mapValuesToArray(map)).toEqual([1, 2])
        })
    })

    describe('compact', () => {
        it('should return an empty array for an empty array', () => {
            expect(compact([])).toEqual([])
        })

        it('should remove null and undefined values', () => {
            const array = [1, null, 2, undefined, 3]
            expect(compact(array)).toEqual([1, 2, 3])
        })

        it('should not remove falsy values other than null and undefined', () => {
            const array = [0, false, '', NaN]
            expect(compact(array)).toEqual([0, false, '', NaN])
        })

        it('should return an empty array if all elements are null or undefined', () => {
            expect(compact([null, undefined, null])).toEqual([])
        })
    })

    describe('yieldToEventLoop', () => {
        it('should yield execution to the event loop', async () => {
            let yielded = false
            setImmediate(() => {
                yielded = true
            })
            expect(yielded).toBe(false)
            await yieldToEventLoop()
            expect(yielded).toBe(true)
        })
    })

    describe('promiseAllBatched', () => {
        it('should process items in batches and return all results', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = async (item: number) => item * 2
            const results = await promiseAllBatched(items, fn, 2)
            expect(results).toEqual([2, 4, 6, 8, 10])
        })

        it('should call onBatchComplete with correct numbers', async () => {
            const items = [1, 2, 3, 4, 5]
            const fn = async (item: number) => item * 2
            const onBatchComplete = jest.fn()
            await promiseAllBatched(items, fn, 2, onBatchComplete)

            expect(onBatchComplete).toHaveBeenCalledTimes(3)
            expect(onBatchComplete).toHaveBeenNthCalledWith(1, 2, 5)
            expect(onBatchComplete).toHaveBeenNthCalledWith(2, 4, 5)
            expect(onBatchComplete).toHaveBeenNthCalledWith(3, 5, 5)
        })

        it('should handle empty items array', async () => {
            const results = await promiseAllBatched([], async (item) => item)
            expect(results).toEqual([])
        })
    })

    describe('forEachBatched', () => {
        it('should process items in batches without returning results', async () => {
            const items = [1, 2, 3, 4, 5]
            const processed: number[] = []
            const fn = async (item: number) => {
                processed.push(item * 2)
            }
            await forEachBatched(items, fn, 2)
            expect(processed).toEqual([2, 4, 6, 8, 10])
        })

        it('should handle empty items array', async () => {
            let called = false
            await forEachBatched([], async () => {
                called = true
            })
            expect(called).toBe(false)
        })
    })
})
