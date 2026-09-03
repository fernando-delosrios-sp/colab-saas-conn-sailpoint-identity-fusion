import type { Mocked } from 'vitest'
import { ClientService } from '../clientService'
import { IscApiAdapter } from '../iscApiAdapter'
import { ApiQueue } from '../queue'
import { FusionConfig } from '../../../model/config'
import { LogService } from '../../logService'
import { QueuePriority, PaginationError } from '../types'
import type { IscApiSurface } from '../iscApiSurface'
import { getRequestAbortSignal } from '../helpers'

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
                rateLimitWaitCount: 0,
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

    it('passes caller abortSignal to queue without merging provisioning timeout', async () => {
        mockQueue.enqueue.mockImplementation(async (execute) => execute())
        const config = { ...mockConfig, provisioningTimeout: 1 } as FusionConfig
        const client = new ClientService(mockAdapter, mockQueue, config, mockLog)
        activeClients.push(client)
        const callerController = new AbortController()

        await client.call(() => Promise.resolve(), { abortSignal: callerController.signal })

        expect(mockQueue.enqueue).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ abortSignal: callerController.signal })
        )
    })

    it('does not timeout while queued longer than provisioningTimeout when HTTP is fast once execution starts', async () => {
        vi.useFakeTimers()
        const realQueue = new ApiQueue({
            requestsPerSecond: 100,
            maxConcurrentRequests: 1,
            maxRetries: 0,
            enablePriority: true,
        })
        const config = { ...mockConfig, provisioningTimeout: 1 } as FusionConfig
        const client = new ClientService(mockAdapter, realQueue, config, mockLog)
        activeClients.push(client)

        let blockerResolve: () => void
        const blocker = new Promise<void>((resolve) => {
            blockerResolve = resolve
        })
        void client.call(() => blocker, { throwOnError: false })

        mockAdapter.accountsApi = {
            updateAccount: vi.fn(() => Promise.resolve({ id: 'ok' })),
        } as any

        const promise = client.call(
            (api: IscApiSurface) => api.accounts.updateAccount({} as any),
            { throwOnError: true }
        )

        await vi.advanceTimersByTimeAsync(2000)
        blockerResolve!()
        await vi.advanceTimersByTimeAsync(0)

        await expect(promise).resolves.toEqual({ id: 'ok' })

        realQueue.stop()
        realQueue.clear()
        vi.useRealTimers()
    })

    it('aborts slow HTTP after execution start when provisioning timeout expires', async () => {
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

    it('gets fresh timeout budget on retry after retryable failure', async () => {
        vi.useFakeTimers()
        const realQueue = new ApiQueue({
            requestsPerSecond: 100,
            maxConcurrentRequests: 1,
            maxRetries: 1,
            enablePriority: true,
        })
        const config = { ...mockConfig, provisioningTimeout: 1 } as FusionConfig
        const client = new ClientService(mockAdapter, realQueue, config, mockLog)
        activeClients.push(client)

        let blockerResolve: () => void
        const blocker = new Promise<void>((resolve) => {
            blockerResolve = resolve
        })
        void client.call(() => blocker, { throwOnError: false })

        let attempts = 0
        mockAdapter.accountsApi = {
            updateAccount: vi.fn(() => {
                attempts++
                if (attempts === 1) {
                    const err = new Error('429 Too Many Requests') as Error & {
                        response?: { status: number }
                    }
                    err.response = { status: 429 }
                    return Promise.reject(err)
                }
                return Promise.resolve({ id: 'ok' })
            }),
        } as any

        const promise = client.call(
            (api: IscApiSurface) => api.accounts.updateAccount({} as any),
            { throwOnError: true }
        )

        await vi.advanceTimersByTimeAsync(2000)
        blockerResolve!()
        await vi.runAllTimersAsync()

        await expect(promise).resolves.toEqual({ id: 'ok' })
        expect(attempts).toBe(2)

        realQueue.stop()
        realQueue.clear()
        vi.useRealTimers()
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
        const setImmediateSpy = vi.spyOn(global, 'setImmediate')
        const progress: number[] = []

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
            {
                paginate: { mode: 'sequential', baseParams: {} },
                onPageProgress: (loaded) => progress.push(loaded),
            }
        )

        expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
        expect(progress).toEqual([2, 3, 3])
        expect(setImmediateSpy).toHaveBeenCalledTimes(2)
        setImmediateSpy.mockRestore()
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
        const setImmediateSpy = vi.spyOn(global, 'setImmediate')
        const progress: number[] = []

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
            {
                paginate: {
                    mode: 'searchAfter',
                    search: { indices: ['identities'], query: { query: '*' } } as any,
                },
                onPageProgress: (loaded) => progress.push(loaded),
            }
        )

        expect(result).toEqual([{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }])
        expect(progress).toEqual([2, 3])
        expect(setImmediateSpy).toHaveBeenCalledTimes(2)
        setImmediateSpy.mockRestore()
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

        const first = await gen.next()
        const collected: any[][] = [first.value!]
        expect(progressCalls).toEqual([{ loaded: 2, total: 3 }])
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

    it('rejects instead of spinning when a mid-window page fails after a sibling resolves', async () => {
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, parallelBatchSize: 3 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '5' } })
                }
                // Fails only after its siblings have settled, so Promise.race resolves on a
                // sibling and the scheduler must still surface this rejection.
                if (offset === 1) {
                    return new Promise((_resolve, reject) => {
                        setTimeout(() => reject(new Error('page-failed')), 30)
                    })
                }
                return Promise.resolve({ data: [{ id: `a${offset}` }] })
            }),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { context: 'test-dropped-rejection', paginate: { mode: 'parallel', baseParams: {} } }
        )

        await expect(async () => {
            for await (const _page of gen) {
                // the dropped offset must surface as an error rather than hanging
            }
        }).rejects.toThrow(PaginationError)
    }, 5000)

    it('rejects when a page resolves without data instead of leaving a gap in the sequence', async () => {
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, parallelBatchSize: 2 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '3' } })
                }
                return offset === 1 ? Promise.resolve({}) : Promise.resolve({ data: [{ id: `a${offset}` }] })
            }),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { context: 'test-missing-data', paginate: { mode: 'parallel', baseParams: {} } }
        )

        await expect(async () => {
            for await (const _page of gen) {
                // consume until the gap is detected
            }
        }).rejects.toThrow(PaginationError)
    }, 5000)

    it('still paginates when parallelBatchSize is configured as zero', async () => {
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, parallelBatchSize: 0 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                return offset === 0
                    ? Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '3' } })
                    : Promise.resolve({ data: [{ id: `a${offset}` }] })
            }),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { paginate: { mode: 'parallel', baseParams: {} } }
        )

        const collected: any[][] = []
        for await (const page of gen) {
            collected.push(page)
        }

        expect(collected.flat().map((item) => item.id)).toEqual(['a0', 'a1', 'a2'])
    }, 5000)

    it('schedules next offset when a fast page frees a sliding-window slot before a slow page completes', async () => {
        const sc = {
            ...mockConfig,
            pageSize: 1,
            sailPointListMax: 250,
            parallelBatchSize: 2,
            maxConcurrentRequests: 10,
        }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        const slowOffset = 2
        let maxInFlight = 0
        let inFlight = 0
        let offset3StartedWhileOffset2InFlight = false

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                inFlight++
                maxInFlight = Math.max(maxInFlight, inFlight)
                if (offset === 3 && inFlight > 1) {
                    offset3StartedWhileOffset2InFlight = true
                }
                return new Promise((resolve) => {
                    const delayMs = offset === slowOffset ? 50 : 0
                    setTimeout(() => {
                        inFlight--
                        if (offset === 0) {
                            resolve({ data: [{ id: 'p0' }], headers: { 'x-total-count': '4' } })
                        } else {
                            resolve({ data: [{ id: `p${offset}` }] })
                        }
                    }, delayMs)
                })
            }),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { paginate: { mode: 'parallel', baseParams: {}, batchSize: 2 } }
        )

        const pages: any[][] = []
        for await (const page of gen) {
            pages.push(page)
        }

        expect(pages.flat().map((item) => item.id)).toEqual(['p0', 'p1', 'p2', 'p3'])
        expect(maxInFlight).toBeGreaterThan(1)
        expect(offset3StartedWhileOffset2InFlight).toBe(true)
    })

    it('yields parallel pages in ascending offset order when completions arrive out of order', async () => {
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, parallelBatchSize: 3 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                const delayMs = offset === 1 ? 30 : offset === 2 ? 0 : 10
                return new Promise((resolve) => {
                    setTimeout(() => {
                        if (offset === 0) {
                            resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '3' } })
                        } else {
                            resolve({ data: [{ id: `a${offset}` }] })
                        }
                    }, delayMs)
                })
            }),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { paginate: { mode: 'parallel', baseParams: {} } }
        )

        const collected: any[][] = []
        for await (const page of gen) {
            collected.push(page)
        }

        expect(collected.flat().map((item) => item.id)).toEqual(['a0', 'a1', 'a2'])
    })

    it('reports onPageProgress after each parallel page completes', async () => {
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, parallelBatchSize: 2 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '3' } })
                }
                return Promise.resolve({ data: [{ id: `a${offset}` }] })
            }),
        } as any

        const progressCalls: number[] = []
        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            {
                paginate: { mode: 'parallel', baseParams: {} },
                onPageProgress: (loaded) => progressCalls.push(loaded),
            }
        )

        for await (const _page of gen) {
            // consume
        }

        expect(progressCalls).toEqual([1, 2, 3])
    })

    it('preserves configured parallelBatchSize when greater than maxConcurrentRequests', () => {
        const sc = {
            ...mockConfig,
            parallelBatchSize: 16,
            maxConcurrentRequests: 10,
        }
        const client = new ClientService(mockAdapter, mockQueue, sc, mockLog)
        activeClients.push(client)

        expect((client as any).parallelBatchSize).toBe(16)
    })

    // -------------------------------------------------------------------------
    // Pagination circuit (gateway failure cooldown-then-abort)
    // -------------------------------------------------------------------------

    const gateway504 = () => {
        const err = new Error('Gateway Timeout') as Error & { response?: { status: number } }
        err.response = { status: 504 }
        return err
    }

    const httpError = (status: number, message: string) => {
        const err = new Error(message) as Error & { response?: { status: number } }
        err.response = { status }
        return err
    }

    it('parallel window sheds, cools down, and resumes after a successful probe', async () => {
        const sc = {
            ...mockConfig,
            pageSize: 1,
            sailPointListMax: 250,
            parallelBatchSize: 4,
            paginationCooldownMs: 0,
        }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        const attempts = new Map<number, number>()
        let hangAborted = false

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                attempts.set(offset, (attempts.get(offset) ?? 0) + 1)
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '6' } })
                }
                if (offset >= 1 && offset <= 3 && attempts.get(offset) === 1) {
                    return Promise.reject(gateway504())
                }
                if (offset === 4 && attempts.get(offset) === 1) {
                    return new Promise((_resolve, reject) => {
                        const signal = getRequestAbortSignal()
                        if (!signal) {
                            reject(new Error('expected request abort signal on in-flight page'))
                            return
                        }
                        signal.addEventListener(
                            'abort',
                            () => {
                                hangAborted = true
                                reject(signal.reason ?? new Error('Aborted'))
                            },
                            { once: true }
                        )
                    })
                }
                return Promise.resolve({ data: [{ id: `a${offset}` }] })
            }),
        } as any

        const unrelated = client.call((_api: IscApiSurface) => Promise.resolve('unrelated-ok'))

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { context: 'circuit-resume', paginate: { mode: 'parallel', baseParams: {}, batchSize: 4 } }
        )

        const collected: string[] = []
        for await (const page of gen) {
            collected.push(...page.map((item: { id: string }) => item.id))
        }

        expect(await unrelated).toBe('unrelated-ok')
        expect(collected).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5'])
        expect(hangAborted).toBe(true)
        expect(mockLog.warn).toHaveBeenCalledWith(expect.stringMatching(/shedding/i))
        expect(mockLog.warn).toHaveBeenCalledWith(expect.stringMatching(/cooldown/i))
        expect(mockLog.warn).toHaveBeenCalledWith(expect.stringMatching(/probe/i))
        expect(attempts.get(1)).toBeGreaterThanOrEqual(2)
    }, 5000)

    it('does not sleep the default 30s cooldown when paginationCooldownMs is injected', async () => {
        vi.useFakeTimers()
        const sc = {
            ...mockConfig,
            pageSize: 1,
            sailPointListMax: 250,
            parallelBatchSize: 3,
            paginationCooldownMs: 40,
        }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        const attempts = new Map<number, number>()
        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                attempts.set(offset, (attempts.get(offset) ?? 0) + 1)
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '4' } })
                }
                if (attempts.get(offset) === 1) {
                    return Promise.reject(gateway504())
                }
                return Promise.resolve({ data: [{ id: `a${offset}` }] })
            }),
        } as any

        try {
            const gen = client.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { paginate: { mode: 'parallel', baseParams: {}, batchSize: 3 } }
            )
            const consume = (async () => {
                for await (const _page of gen) {
                    // consume
                }
            })()
            await vi.advanceTimersByTimeAsync(40)
            await consume
            expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('40ms'))
            expect(mockLog.warn).not.toHaveBeenCalledWith(expect.stringContaining('30000ms'))
        } finally {
            vi.useRealTimers()
        }
    })

    it('probe gateway failure aborts with PaginationError and no silent partial success', async () => {
        const sc = {
            ...mockConfig,
            pageSize: 1,
            sailPointListMax: 250,
            parallelBatchSize: 3,
            paginationCooldownMs: 0,
        }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '4' } })
                }
                return Promise.reject(gateway504())
            }),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { context: 'probe-fail', paginate: { mode: 'parallel', baseParams: {} } }
        )

        let thrown: unknown
        try {
            for await (const _page of gen) {
                // consume until circuit abort
            }
        } catch (error: unknown) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(PaginationError)
        expect((thrown as PaginationError).itemsCollected).toBe(1)
        expect((thrown as PaginationError).message).toContain('probe-fail')
        const cooldownWarns = (mockLog.warn as any).mock.calls.filter((call: string[]) =>
            String(call[0]).toLowerCase().includes('cooldown')
        )
        expect(cooldownWarns).toHaveLength(1)
    })

    it('second streak after resume aborts without another cooldown', async () => {
        const sc = {
            ...mockConfig,
            pageSize: 1,
            sailPointListMax: 250,
            parallelBatchSize: 3,
            paginationCooldownMs: 0,
        }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        const attempts = new Map<number, number>()
        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                attempts.set(offset, (attempts.get(offset) ?? 0) + 1)
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }], headers: { 'x-total-count': '7' } })
                }
                const n = attempts.get(offset)!
                if (offset <= 3 && n === 1) {
                    return Promise.reject(gateway504())
                }
                if (offset >= 4 && offset <= 6) {
                    return Promise.reject(gateway504())
                }
                return Promise.resolve({ data: [{ id: `a${offset}` }] })
            }),
        } as any

        const gen = client.call(
            (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
            { paginate: { mode: 'parallel', baseParams: {}, batchSize: 3 } }
        )

        await expect(async () => {
            for await (const _page of gen) {
                // first streak resumes; second streak must throw
            }
        }).rejects.toThrow(PaginationError)

        const cooldownWarns = (mockLog.warn as any).mock.calls.filter((call: string[]) =>
            String(call[0]).toLowerCase().includes('cooldown')
        )
        expect(cooldownWarns).toHaveLength(1)
        expect(mockLog.warn).toHaveBeenCalledWith(expect.stringMatching(/second gateway-failure streak/i))
    })

    it('HTTP 429 follows Retry-After and does not trip the pagination circuit', async () => {
        vi.useFakeTimers()
        const realQueue = new ApiQueue({
            requestsPerSecond: 100,
            maxConcurrentRequests: 5,
            maxRetries: 20,
            enablePriority: true,
        })
        const sc = { ...mockConfig, pageSize: 2, sailPointListMax: 250, paginationCooldownMs: 0 }
        const client = new ClientService(mockAdapter, realQueue, sc, mockLog)
        activeClients.push(client)

        let calls = 0
        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation(() => {
                calls++
                if (calls === 1) {
                    const err = httpError(429, 'Too Many Requests') as Error & {
                        response?: { status: number; headers?: Record<string, string> }
                    }
                    err.response = { status: 429, headers: { 'retry-after': '1' } }
                    return Promise.reject(err)
                }
                return Promise.resolve({ data: [{ id: 'a' }] })
            }),
        } as any

        try {
            const promise = client.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { paginate: { mode: 'sequential', baseParams: {} } }
            )
            await vi.runAllTimersAsync()
            await expect(promise).resolves.toEqual([{ id: 'a' }])
            expect(calls).toBe(2)
            expect(mockLog.warn).not.toHaveBeenCalledWith(expect.stringMatching(/shedding|cooldown/i))
        } finally {
            realQueue.stop()
            realQueue.clear()
            vi.useRealTimers()
        }
    })

    it('exhausted HTTP 500 throws PaginationError without cooldown', async () => {
        const sc = { ...mockConfig, paginationCooldownMs: 0 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockRejectedValue(httpError(500, 'Internal Server Error')),
        } as any

        await expect(
            client.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { paginate: { mode: 'sequential', baseParams: {} } }
            )
        ).rejects.toThrow(PaginationError)

        expect(mockLog.warn).not.toHaveBeenCalledWith(expect.stringMatching(/cooldown/i))
    })

    it('caller abort during cooldown skips the probe', async () => {
        vi.useFakeTimers()
        const sc = {
            ...mockConfig,
            pageSize: 1,
            sailPointListMax: 250,
            paginationCooldownMs: 5_000,
        }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)
        const abort = new AbortController()
        let calls = 0

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                calls++
                const offset = params.offset ?? 0
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }] })
                }
                return Promise.reject(gateway504())
            }),
        } as any

        try {
            const promise = client.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { abortSignal: abort.signal, paginate: { mode: 'sequential', baseParams: {} } }
            )
            const assertion = expect(promise).rejects.toThrow(PaginationError)
            await vi.advanceTimersByTimeAsync(10)
            abort.abort()
            await vi.advanceTimersByTimeAsync(5_000)
            await assertion
            expect(calls).toBe(4)
        } finally {
            vi.useRealTimers()
        }
    })

    it('sequential and searchAfter use the same circuit and probe the same offset or cursor', async () => {
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, paginationCooldownMs: 0 }
        const seqClient = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(seqClient)

        const seqOffsets: number[] = []
        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockImplementation((params: { offset?: number }) => {
                const offset = params.offset ?? 0
                seqOffsets.push(offset)
                if (offset === 0) {
                    return Promise.resolve({ data: [{ id: 'a0' }] })
                }
                return Promise.reject(gateway504())
            }),
        } as any

        await expect(
            seqClient.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { paginate: { mode: 'sequential', baseParams: {} } }
            )
        ).rejects.toThrow(PaginationError)

        expect(seqOffsets.filter((offset) => offset === 1).length).toBeGreaterThanOrEqual(4)

        const searchClient = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(searchClient)
        const searchAfterBodies: unknown[] = []
        mockAdapter.searchApi = {
            searchPost: vi.fn().mockImplementation((params: any) => {
                searchAfterBodies.push(params.search?.searchAfter)
                if (!params.search?.searchAfter) {
                    return Promise.resolve({ data: [{ id: 'id1' }] })
                }
                return Promise.reject(gateway504())
            }),
        } as any

        await expect(
            searchClient.call(
                (_api: IscApiSurface, params: any) => (_api.search.searchPost as any)(params),
                {
                    paginate: {
                        mode: 'searchAfter',
                        search: { indices: ['identities'], query: { query: '*' } } as any,
                    },
                }
            )
        ).rejects.toThrow(PaginationError)

        const failedCursor = searchAfterBodies.filter((cursor) => cursor !== undefined)
        expect(failedCursor.length).toBeGreaterThanOrEqual(4)
        expect(new Set(failedCursor.map((cursor) => JSON.stringify(cursor))).size).toBe(1)
    })

    it('paginated 504 uses at most one retry per page fetch', async () => {
        vi.useFakeTimers()
        const realQueue = new ApiQueue({
            requestsPerSecond: 100,
            maxConcurrentRequests: 5,
            maxRetries: 20,
            enablePriority: true,
        })
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, paginationCooldownMs: 0 }
        const client = new ClientService(mockAdapter, realQueue, sc, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            listAccounts: vi.fn().mockRejectedValue(gateway504()),
        } as any

        try {
            const promise = client.call(
                (_api: IscApiSurface, params: any) => (_api.accounts.listAccounts as any)(params),
                { paginate: { mode: 'sequential', baseParams: {} } }
            )
            const assertion = expect(promise).rejects.toThrow(PaginationError)
            await vi.runAllTimersAsync()
            await assertion
            expect(mockAdapter.accountsApi.listAccounts).toHaveBeenCalledTimes(8)
        } finally {
            realQueue.stop()
            realQueue.clear()
            vi.useRealTimers()
        }
    })

    it('non-paginated 504 keeps configured retries and does not shed other calls', async () => {
        vi.useFakeTimers()
        const realQueue = new ApiQueue({
            requestsPerSecond: 100,
            maxConcurrentRequests: 5,
            maxRetries: 20,
            enablePriority: true,
        })
        const client = new ClientService(mockAdapter, realQueue, mockConfig, mockLog)
        activeClients.push(client)

        mockAdapter.accountsApi = {
            updateAccount: vi.fn().mockRejectedValue(gateway504()),
        } as any

        try {
            const promise = client.call(
                (api: IscApiSurface) => api.accounts.updateAccount({} as any),
                { throwOnError: true }
            )
            const assertion = expect(promise).rejects.toThrow(/Gateway Timeout/)
            await vi.runAllTimersAsync()
            await assertion
            expect(mockAdapter.accountsApi.updateAccount).toHaveBeenCalledTimes(21)
            expect(mockLog.warn).not.toHaveBeenCalledWith(expect.stringMatching(/shedding/i))
        } finally {
            realQueue.stop()
            realQueue.clear()
            vi.useRealTimers()
        }
    })

    it('paginateSearchApiGenerator applies the pagination circuit on gateway failures', async () => {
        const sc = { ...mockConfig, pageSize: 1, sailPointListMax: 250, paginationCooldownMs: 0 }
        const client = new ClientService(mockAdapter, null, sc, mockLog)
        activeClients.push(client)

        mockAdapter.searchApi = {
            searchPost: vi.fn().mockImplementation((params: any) => {
                if (!params.search?.searchAfter) {
                    return Promise.resolve({ data: [{ id: 'id1' }], headers: { 'x-total-count': '2' } })
                }
                return Promise.reject(gateway504())
            }),
        } as any

        const gen = client.paginateSearchApiGenerator(
            { indices: ['identities'], query: { query: '*' } } as any,
            QueuePriority.MEDIUM,
            'identity-fetch'
        )

        await expect(async () => {
            for await (const _page of gen) {
                // first page yields; later cursor 504s trip the circuit
            }
        }).rejects.toThrow(PaginationError)

        expect(mockLog.warn).toHaveBeenCalledWith(expect.stringMatching(/cooldown/i))
        expect(mockAdapter.searchApi.searchPost.mock.calls.length).toBeGreaterThanOrEqual(4)
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




