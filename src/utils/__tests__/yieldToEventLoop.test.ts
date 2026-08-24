import { forEachChunked } from '../yieldToEventLoop'

describe('forEachChunked', () => {
    it('processes items in order and reports each chunk boundary', async () => {
        const processed: number[] = []
        const progress: Array<[number, number]> = []

        await forEachChunked([1, 2, 3, 4, 5], (item) => processed.push(item), {
            chunkSize: 2,
            onProgress: (done, total) => progress.push([done, total]),
        })

        expect(processed).toEqual([1, 2, 3, 4, 5])
        expect(progress).toEqual([
            [2, 5],
            [4, 5],
            [5, 5],
        ])
    })

    it('does not yield or report progress for an empty array', async () => {
        const setImmediateSpy = vi.spyOn(global, 'setImmediate')
        const onProgress = vi.fn()

        await forEachChunked([], vi.fn(), { onProgress })

        expect(setImmediateSpy).not.toHaveBeenCalled()
        expect(onProgress).not.toHaveBeenCalled()
        setImmediateSpy.mockRestore()
    })

    it('processes a small array as one chunk and yields once', async () => {
        const setImmediateSpy = vi.spyOn(global, 'setImmediate')
        const onProgress = vi.fn()

        await forEachChunked([1, 2], vi.fn(), { onProgress })

        expect(setImmediateSpy).toHaveBeenCalledTimes(1)
        expect(onProgress).toHaveBeenCalledWith(2, 2)
        setImmediateSpy.mockRestore()
    })

    it('yields between chunks', async () => {
        const events: string[] = []

        await forEachChunked([1, 2, 3], (item) => events.push(`item:${item}`), {
            chunkSize: 2,
            onProgress: (done) => events.push(`progress:${done}`),
        })

        expect(events).toEqual(['item:1', 'item:2', 'progress:2', 'item:3', 'progress:3'])
    })
})
