import { ClientService, Priority } from '../clientService'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function buildClient(apiMaxConcurrent = 2): ClientService {
    const client: any = Object.create(ClientService.prototype)
    client.pageSize = 10
    client.sailPointListMax = 10
    client.paginateParallelWindowSize = Math.max(1, apiMaxConcurrent * 2)
    client.execute = jest.fn()
    return client as ClientService
}

describe('ClientService paginateParallel', () => {
    it('limits in-flight page fetches and preserves ordered page output', async () => {
        const client = buildClient(2)
        let active = 0
        let maxActive = 0

        ;(client as any).execute = jest.fn(async (apiFunction: () => Promise<any>) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            try {
                return await apiFunction()
            } finally {
                active -= 1
            }
        })

        const callFunction = jest.fn(async (params: { offset: number; limit: number; count?: boolean }) => {
            await delay(10)
            return {
                data: [params.offset, params.offset + 1],
                headers: params.count ? { 'x-total-count': '70' } : undefined,
            }
        })

        const pages: number[][] = []
        for await (const page of client.paginateParallel<number, { offset: number; limit: number; count?: boolean }>(
            callFunction,
            {},
            Priority.MEDIUM
        )) {
            pages.push(page)
        }

        expect(maxActive).toBeLessThanOrEqual(4)
        expect(pages).toEqual([[0, 1], [2, 3], [12, 13], [22, 23], [32, 33], [42, 43], [52, 53], [62, 63]])
    })
})
