import type { Mocked } from 'vitest'
import { ClientService } from '../clientService'
import { IscApiAdapter } from '../iscApiAdapter'
import { ApiQueue } from '../queue'
import { FusionConfig } from '../../../model/config'
import { LogService } from '../../logService'
import { QueuePriority, PaginationError } from '../types'
import type { IscApiSurface } from '../iscApiSurface'

describe('ClientService', () => {
    let mockAdapter: Mocked<IscApiAdapter>
    let mockQueue: Mocked<ApiQueue>
    let mockLog: Mocked<LogService>
    let mockConfig: FusionConfig

    let activeClients: ClientService[] = []

    beforeEach(() => {
        activeClients = []
        mockAdapter = {
            config: {} as any,
            accountsApi: {} as any,
            identitiesApi: {} as any,
            searchApi: {} as any,
            sourcesApi: {} as any,
            customFormsApi: {} as any,
            workflowsApi: {} as any,
            entitlementsApi: {} as any,
            transformsApi: {} as any,
            governanceGroupsApi: {} as any,
            taskManagementApi: {} as any,
            identityProfilesApi: {} as any,
            identityAttributesApi: {} as any,
        }

        mockQueue = {
            enqueue: vi.fn(),
            getStats: vi.fn().mockReturnValue({
                queueLength: 0,
                activeRequests: 0,
                totalProcessed: 0,
                totalFailed: 0,
                totalRetries: 0,
                averageWaitTime: 0,
                averageProcessingTime: 0,
            }),
            getPendingItems: vi.fn().mockReturnValue([]),
            getActiveItems: vi.fn().mockReturnValue([]),
            clear: vi.fn(),
            stop: vi.fn(),
        } as unknown as Mocked<ApiQueue>

        mockLog = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        } as unknown as Mocked<LogService>

        mockConfig = {
            requestsPerSecond: 10,
            pageSize: 250,
            sailPointListMax: 250,
            statsLoggingIntervalMs: 60000,
        } as unknown as FusionConfig
    })

    afterEach(() => {
        activeClients.forEach((client) => client.dispose())
    })

    // -------------------------------------------------------------------------
    // call() — single requests
    // -------------------------------------------------------------------------

    it('routes a single request through the queue via call()', async () => {
        mockQueue.enqueue.mockResolvedValue('queued-result')
        const client = new ClientService(mockAdapter, mockQueue, mockConfig, mockLog)
        activeClients.push(client)

        const result = await client.call(
            (_api: IscApiSurface) => Promise.resolve('queued-result')
        )

        expect(mockQueue.enqueue).toHaveBeenCalled()
        expect(result).toBe('queued-result')
    })

    it('executes directly via call() when queue is null', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)
        const apiFn = vi.fn().mockResolvedValue('success')
        mockAdapter.accountsApi = { updateAccount: apiFn } as any

        await client.call(
            (api: IscApiSurface) => api.accounts.updateAccount({} as any),
            { priority: QueuePriority.MEDIUM }
        )

        expect(apiFn).toHaveBeenCalled()
    })

    it('returns undefined on failure via call() when throwOnError is false', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)

        const result = await client.call(
            (_api: IscApiSurface) => Promise.reject(new Error('api-error')),
            { context: 'test', throwOnError: false }
        )

        expect(result).toBeUndefined()
        expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('api-error'))
    })

    it('throws on failure via call() when throwOnError is true', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)
        const error = new Error('api-error')

        await expect(
            client.call(
                (_api: IscApiSurface) => Promise.reject(error),
                { throwOnError: true }
            )
        ).rejects.toThrow(error)
    })

    it('passes merged abort signal when provisioning timeout is configured', async () => {
        mockQueue.enqueue.mockResolvedValue(undefined)
        const config = { ...mockConfig, provisioningTimeout: 1 } as FusionConfig
        const client = new ClientService(mockAdapter, mockQueue, config, mockLog)
        activeClients.push(client)

        await client.call(() => new Promise(() => {}))

        expect(mockQueue.enqueue).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) })
        )
    })

    it('aborts slow queued request when provisioning timeout expires', async () => {
        vi.useFakeTimers()
        const realQueue = new ApiQueue({
            requestsPerSecond: 100,
            maxConcurrentRequests: 10,
            maxRetries: 0,
            enablePriority: true,
        })
        const config = { ...mockConfig, provisioningTimeout: 1 } as FusionConfig
        const client = new ClientService(mockAdapter, realQueue, config, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            updateAccount: vi.fn(() => new Promise(() => {})),
        } as any

        try {
            const promise = client.call(
                (api: IscApiSurface) => api.accounts.updateAccount({} as any),
                { throwOnError: true }
            )
            const assertion = expect(promise).rejects.toThrow(/timed out/i)
            await vi.advanceTimersByTimeAsync(1000)
            await assertion
        } finally {
            realQueue.stop()
            realQueue.clear()
            vi.useRealTimers()
        }
    })

    it('passes priority, context, and noRetry from policy via call()', async () => {
        mockQueue.enqueue.mockResolvedValue('result')
        const client = new ClientService(mockAdapter, mockQueue, mockConfig, mockLog)
        activeClients.push(client)

        await client.call(
            (_api: IscApiSurface) => Promise.resolve('result'),
            { priority: QueuePriority.HIGH, noRetry: true, context: 'my-context' }
        )

        expect(mockQueue.enqueue).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ priority: QueuePriority.HIGH, noRetry: true, label: 'my-context' })
        )
    })

    it('exposes IscApiSurface to the callback via call()', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)
        let captured: IscApiSurface | undefined

        mockAdapter.accountsApi = { listAccounts: vi.fn() } as any
        await client.call(
            (api: IscApiSurface) => { captured = api; return Promise.resolve() }
        )

        expect(captured).toBeDefined()
        expect(captured!.accounts).toBe(mockAdapter.accountsApi)
        expect(captured!.sources).toBe(mockAdapter.sourcesApi)
    })

    // -------------------------------------------------------------------------
    // call() — paginate sequential
    // -------------------------------------------------------------------------

    it('collects pages via call() with sequential pagination', async () => {
        const sc = { ...mockConfig, pageSize: 2, sailPointListMax: 250 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        let calls = 0
        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((_params: any) => {
                calls++
                return calls === 1
                    ? Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }] })
                    : Promise.resolve({ data: [{ id: 'c' }] })
            }),
        } as any

        const result = await client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { paginate: { mode: 'sequential', baseParams: {} } }
        )

        expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    })

    it('throws PaginationError on sequential pagination failure', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockRejectedValue(new Error('network-error')),
        } as any

        await expect(
            client.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { context: 'test-seq', paginate: { mode: 'sequential', baseParams: {} } }
            )
        ).rejects.toThrow(PaginationError)

        try {
            await client.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { context: 'test-seq', paginate: { mode: 'sequential', baseParams: {} } }
            )
        } catch (e: unknown) {
            const err = e as PaginationError
            expect(err.itemsCollected).toBe(0)
            expect(err.message).toContain('test-seq')
        }
    })

    // -------------------------------------------------------------------------
    // call() — paginate searchAfter
    // -------------------------------------------------------------------------

    it('paginates via call() with searchAfter mode', async () => {
        const sc = { ...mockConfig, pageSize: 2, sailPointListMax: 250 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        let calls = 0
        mockAdapter.searchApi = {
            searchPost: vi.fn().mockImplementation((_params: any) => {
                calls++
                return calls === 1
                    ? Promise.resolve({ data: [{ id: 'id1' }, { id: 'id2' }] })
                    : Promise.resolve({ data: [{ id: 'id3' }] })
            }),
        } as any

        const result = await client.call(
            (_api: IscApiSurface, params: any) => (_api.search.searchPost as any)(params),
            { paginate: { mode: 'searchAfter', search: { indices: ['identities'], query: { query: '*' } } as any } }
        )

        expect(result).toEqual([{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }])
    })

    it('throws PaginationError on searchAfter pagination failure', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)

        mockAdapter.searchApi = {
            searchPost: vi.fn().mockRejectedValue(new Error('search-failed')),
        } as any

        await expect(
            client.call(
                (_api: IscApiSurface, params: any) => (_api.search.searchPost as any)(params),
                { context: 'test-search', paginate: { mode: 'searchAfter', search: { indices: ['identities'], query: { query: '*' } } as any } }
            )
        ).rejects.toThrow(PaginationError)
    })

    // -------------------------------------------------------------------------
    // call() — paginate parallel (generator)
    // -------------------------------------------------------------------------

    it('yields pages via call() with parallel pagination', async () => {
        const sc = { ...mockConfig, pageSize: 2, sailPointListMax: 250 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        let calls = 0
        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((_params: any) => {
                calls++
                return calls === 1
                    ? Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], headers: { 'x-total-count': '3' } })
                    : Promise.resolve({ data: [{ id: 'c' }] })
            }),
        } as any

        const progressCalls: Array<{ loaded: number; total?: number }> = []
        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            {
                paginate: { mode: 'parallel', baseParams: {} },
                onPageProgress: (loaded, total) => progressCalls.push({ loaded, total }),
            }
        )

        const collected: any[][] = []
        for await (const page of gen) {
            collected.push(page)
        }

        expect(collected).toEqual([[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]])
        expect(progressCalls).toEqual([
            { loaded: 2, total: 3 },
            { loaded: 3, total: 3 },
        ])
    })

    it('throws PaginationError on parallel pagination failure', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockRejectedValue(new Error('network-error')),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { context: 'test-para', paginate: { mode: 'parallel', baseParams: {} } }
        )

        await expect(async () => {
            for await (const _page of gen) {
                // should throw before yielding
            }
        }).rejects.toThrow(PaginationError)
    })

    // -------------------------------------------------------------------------
    // Public API surface
    // -------------------------------------------------------------------------

    it('exposes getQueue, getQueueStats, getQueueItems, and dispose', () => {
        const client = new ClientService(mockAdapter, mockQueue, mockConfig, mockLog)
        activeClients.push(client)

        expect(client.getQueue()).toBe(mockQueue)
        expect(client.getQueueStats().queueLength).toBe(0)
        expect(client.getQueueItems()).toEqual({ pending: [], active: [] })

        client.dispose()
        expect(mockQueue.stop).toHaveBeenCalled()
    })
})


