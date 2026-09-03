import { ApiQueue } from './queue'
import { QueuePriority, QueueStats, QueuedItemInfo, CallPolicy, PaginatePolicy, PaginationError } from './types'
import { LogService } from '../logService'
import { FusionConfig } from '../../model/config'
import { readNumber } from '../../utils/safeRead'
import { yieldToEventLoop } from '../../utils/yieldToEventLoop'
import { mergeAbortSignals, invokeAbortable, runWithRequestAbortSignal, isGatewayFailure } from './helpers'
import { PaginationCircuit, isAbortError } from './paginationCircuit'
import { internalConfig } from '../../data/config/internal'
import { IscApiAdapter } from './iscApiAdapter'
import { IscApiSurface } from './iscApiSurface'
import type { Search, AccountsV2025Api, IdentitiesV2025Api, IdentityAttributesV2025Api, IdentityProfilesV2025Api, CustomFormsV2025Api, EntitlementsV2025Api, GovernanceGroupsV2025Api, TaskManagementV2025Api, SearchApi, TransformsApi, SourcesV2025Api, WorkflowsV2025Api, Configuration } from 'sailpoint-api-client'
/**
 * ClientService provides a lean, centralized client for API operations.
 *
 * Responsibilities:
 * - Configuration and queue management
 * - Generic execution helpers (execute, paginate, paginateSearchApi)
 * - Lazy API instance provisioning
 *
 * Domain-specific operations should live in their respective services
 * (SourceService, IdentityService, etc.) which use this client.
 */
class OffsetPageScheduler<T> {
    private loaded: number
    private scheduleIndex = 0
    private yieldIndex = 0
    private probed = false
    private readonly completed = new Map<number, T[]>()
    private readonly inFlight = new Map<number, Promise<void>>()
    /** First page error, recorded so no task rejection is left unobserved. */
    private failure?: unknown
    /** Never below 1: a zero window would leave the scheduler unable to schedule any page. */
    private readonly window: number

    constructor(
        private readonly offsets: number[],
        windowSize: number,
        initialLoaded: number,
        private readonly progressTotal: number | undefined,
        private readonly fetchPage: (offset: number, extraAbort?: AbortSignal) => Promise<T[]>,
        private readonly fail: (offset: number, loadedBeforeFailure: number) => PaginationError,
        private readonly onPageComplete: (loaded: number, total?: number) => void,
        private readonly circuit: PaginationCircuit,
        private readonly abortSignal?: AbortSignal
    ) {
        this.loaded = initialLoaded
        this.window = Math.max(1, windowSize)
    }

    private lowestUnfilledOffset(): number {
        for (let i = this.yieldIndex; i < this.offsets.length; i++) {
            const offset = this.offsets[i]
            if (!this.completed.has(offset)) {
                return offset
            }
        }
        return this.offsets[Math.min(this.yieldIndex, this.offsets.length - 1)]
    }

    private pump(): void {
        if (this.circuit.isShedding || this.failure !== undefined) {
            return
        }
        while (this.inFlight.size < this.window && this.scheduleIndex < this.offsets.length) {
            const offset = this.offsets[this.scheduleIndex++]
            if (this.completed.has(offset) || this.inFlight.has(offset)) {
                continue
            }
            const task = (async () => {
                if (this.abortSignal?.aborted || this.circuit.isShedding) {
                    return
                }
                try {
                    const page = await this.fetchPage(offset, this.circuit.shedSignal)
                    this.circuit.recordSuccess()
                    this.completed.set(offset, page)
                    this.loaded += page.length
                    this.onPageComplete(this.loaded, this.progressTotal)
                } catch (error: unknown) {
                    if (isAbortError(error, this.circuit.shedSignal) || this.circuit.isShedding) {
                        return
                    }
                    if (this.abortSignal?.aborted || isAbortError(error, this.abortSignal)) {
                        return
                    }
                    if (!isGatewayFailure(error)) {
                        throw this.fail(offset, this.loaded)
                    }
                    const action = this.circuit.noteGatewayFailure()
                    if (action === 'continue') {
                        return
                    }
                    if (action === 'open') {
                        this.circuit.abortAfterSecondStreak(`offset ${offset}`)
                        throw this.fail(offset, this.loaded)
                    }
                    this.circuit.shed(`offset ${offset}`)
                }
            })()
                // Promise.race only settles on the first promise, so a sibling's rejection
                // would otherwise go unobserved and terminate the process.
                .catch((error: unknown) => {
                    this.failure ??= error
                })
                .finally(() => {
                    this.inFlight.delete(offset)
                })
            this.inFlight.set(offset, task)
        }
    }

    private async cooldownAndProbe(): Promise<void> {
        const probeOffset = this.lowestUnfilledOffset()
        try {
            await this.circuit.cooldown()
        } catch {
            throw this.fail(probeOffset, this.loaded)
        }
        this.circuit.beginProbe(`offset ${probeOffset}`)
        this.probed = true
        try {
            const page = await this.fetchPage(probeOffset)
            this.circuit.recordSuccess()
            this.circuit.resumeAfterSuccessfulProbe()
            this.completed.set(probeOffset, page)
            this.loaded += page.length
            this.onPageComplete(this.loaded, this.progressTotal)
            this.scheduleIndex = this.yieldIndex
        } catch (error: unknown) {
            if (this.abortSignal?.aborted || isAbortError(error, this.abortSignal)) {
                throw this.fail(probeOffset, this.loaded)
            }
            this.circuit.abortAfterFailedProbe(`offset ${probeOffset}`)
            throw this.fail(probeOffset, this.loaded)
        }
    }

    async *run(): AsyncGenerator<T[], void, unknown> {
        this.pump()

        while (this.yieldIndex < this.offsets.length || this.inFlight.size > 0) {
            if (this.abortSignal?.aborted) {
                return
            }
            if (this.failure !== undefined) {
                throw this.failure
            }

            while (this.yieldIndex < this.offsets.length) {
                const offset = this.offsets[this.yieldIndex]
                const page = this.completed.get(offset)
                if (!page) {
                    break
                }
                this.completed.delete(offset)
                this.yieldIndex++
                if (page.length > 0) {
                    yield page
                }
            }

            if (this.yieldIndex >= this.offsets.length && this.inFlight.size === 0) {
                break
            }

            if (this.circuit.isShedding) {
                if (this.inFlight.size > 0) {
                    await Promise.race(Array.from(this.inFlight.values()))
                    continue
                }
                if (!this.probed) {
                    await this.cooldownAndProbe()
                    this.pump()
                    continue
                }
            }

            if (this.inFlight.size === 0) {
                // Every offset has been scheduled and settled, yet the next page in
                // sequence never landed. Continuing here would spin without awaiting
                // and starve the event loop for the remainder of the operation.
                throw this.fail(this.lowestUnfilledOffset(), this.loaded)
            }

            await Promise.race(Array.from(this.inFlight.values()))
            this.pump()
        }

        if (this.failure !== undefined) {
            throw this.failure
        }
    }
}


export class ClientService {
    private readonly pageSize: number
    private readonly sailPointListMax: number
    private readonly requestTimeoutMs?: number
    /** Number of pages to fetch in parallel inside paginateParallel. */
    private readonly parallelBatchSize: number
    private readonly consecutiveGatewayFailures: number
    private readonly paginationCooldownMs: number
    private readonly paginationGatewayMaxRetries: number
    private readonly maxCooldownsPerStream: number
    constructor(
        private adapter: IscApiAdapter,
        protected readonly queue: ApiQueue | null,
        fusionConfig: FusionConfig,
        protected log: LogService
    ) {
        // Apply a hard timeout at the client layer to avoid indefinite hangs.
        // Use provisioningTimeout (seconds) as the global per-request timeout.
        // If not set or <= 0, no timeout wrapper is applied.
        this.requestTimeoutMs =
            fusionConfig.provisioningTimeout && fusionConfig.provisioningTimeout > 0
                ? fusionConfig.provisioningTimeout * 1000
                : undefined

        // Store pageSize for pagination
        this.pageSize = fusionConfig.pageSize
        this.sailPointListMax = fusionConfig.sailPointListMax
        const parallelBatchSize = fusionConfig.parallelBatchSize ?? 16
        const maxConcurrentRequests = fusionConfig.maxConcurrentRequests ?? 20
        const clientInternal = internalConfig.clientService

        this.parallelBatchSize = parallelBatchSize
        this.consecutiveGatewayFailures =
            fusionConfig.consecutiveGatewayFailures ?? clientInternal.consecutiveGatewayFailures
        this.paginationCooldownMs = fusionConfig.paginationCooldownMs ?? clientInternal.paginationCooldownMs
        this.paginationGatewayMaxRetries =
            fusionConfig.paginationGatewayMaxRetries ?? clientInternal.paginationGatewayMaxRetries
        this.maxCooldownsPerStream = fusionConfig.maxCooldownsPerStream ?? clientInternal.maxCooldownsPerStream

        if (this.queue) {
            this.log.info(
                `API client ready: queue enabled, ` +
                    `max concurrent: ${maxConcurrentRequests}, parallel page window: ${parallelBatchSize}, keep-alive: true`
            )
        } else {
            this.log.info(
                `API client ready (direct calls, no queue, parallel page window: ${parallelBatchSize}, keep-alive: true)`
            )
        }
    }

    // -------------------------------------------------------------------------
    // API Instance Getters (Lazy Initialization)
    // -------------------------------------------------------------------------

    private get config(): Configuration {
        return this.adapter.config
    }

    public get accessToken(): any {
        return this.adapter.config.accessToken
    }

    private get accountsApi(): AccountsV2025Api {
        return this.adapter.accountsApi
    }

    private get identitiesApi(): IdentitiesV2025Api {
        return this.adapter.identitiesApi
    }

    private get searchApi(): SearchApi {
        return this.adapter.searchApi
    }

    private get sourcesApi(): SourcesV2025Api {
        return this.adapter.sourcesApi
    }

    private get customFormsApi(): CustomFormsV2025Api {
        return this.adapter.customFormsApi
    }

    private get workflowsApi(): WorkflowsV2025Api {
        return this.adapter.workflowsApi
    }

    private get entitlementsApi(): EntitlementsV2025Api {
        return this.adapter.entitlementsApi
    }

    private get transformsApi(): TransformsApi {
        return this.adapter.transformsApi
    }

    private get governanceGroupsApi(): GovernanceGroupsV2025Api {
        return this.adapter.governanceGroupsApi
    }

    private get taskManagementApi(): TaskManagementV2025Api {
        return this.adapter.taskManagementApi
    }

    private get identityProfilesApi(): IdentityProfilesV2025Api {
        return this.adapter.identityProfilesApi
    }

    private get identityAttributesApi(): IdentityAttributesV2025Api {
        return this.adapter.identityAttributesApi
    }

    /**
     * Returns the internal queue instance, or null if queue is disabled.
     */
    public getQueue(): ApiQueue | null {
        return this.queue
    }

    /** Wraps the current adapter (for example with DryRunApiAdapter) without rebuilding the queue. */
    public wrapAdapter(wrap: (inner: IscApiAdapter) => IscApiAdapter): void {
        this.adapter = wrap(this.adapter)
    }

    // -------------------------------------------------------------------------
    // call() — single public entry point for all ISC API invocations
    // -------------------------------------------------------------------------

    public async call<T>(fn: (api: IscApiSurface) => Promise<T>, policy?: CallPolicy): Promise<T | undefined>

    public async call<T>(
        fn: (api: IscApiSurface, params: any) => Promise<{ data: T[] }>,
        policy: PaginatePolicy & { paginate: { mode: 'sequential' } }
    ): Promise<T[]>

    public call<T>(
        fn: (api: IscApiSurface, params: any) => Promise<{ data: T[]; headers?: any }>,
        policy: PaginatePolicy & { paginate: { mode: 'parallel' } }
    ): AsyncGenerator<T[], void, unknown>

    public async call<T>(
        fn: (api: IscApiSurface, params: { search: any; limit: number; count?: boolean }) => Promise<{ data: unknown[] }>,
        policy: PaginatePolicy & { paginate: { mode: 'searchAfter' } }
    ): Promise<T[]>

    public call<T>(fn: (api: IscApiSurface, ...args: any[]) => Promise<any>, policy?: CallPolicy): any {
        const paginate = (policy as PaginatePolicy)?.paginate
        if (!paginate) {
            return this.execute<T>(() => fn(this.apiSurface), policy ?? {})
        }
        switch (paginate.mode) {
            case 'sequential': return this.paginateSequential<T>(fn as any, paginate, policy!)
            case 'parallel': return this.paginateParallelForCall<T>(fn as any, paginate, policy!)
            case 'searchAfter': return this.paginateSearchAfter<T>(fn as any, paginate, policy!)
        }
    }

    private get apiSurface(): IscApiSurface {
        const a = this.adapter
        return {
            get accounts() { return a.accountsApi },
            get identities() { return a.identitiesApi },
            get search() { return a.searchApi },
            get sources() { return a.sourcesApi },
            get customForms() { return a.customFormsApi },
            get workflows() { return a.workflowsApi },
            get entitlements() { return a.entitlementsApi },
            get transforms() { return a.transformsApi },
            get governanceGroups() { return a.governanceGroupsApi },
            get taskManagement() { return a.taskManagementApi },
            get identityProfiles() { return a.identityProfilesApi },
            get identityAttributes() { return a.identityAttributesApi },
        }
    }

    private createPaginationCircuit(policy: Pick<CallPolicy, 'context' | 'abortSignal'>): PaginationCircuit {
        return new PaginationCircuit(
            this.consecutiveGatewayFailures,
            this.paginationCooldownMs,
            this.maxCooldownsPerStream,
            (message) => this.log.warn(message),
            policy.context,
            policy.abortSignal
        )
    }

    /**
     * Fetch one paginated page with gateway-failure retry cap and throw-on-error so the
     * pagination circuit can classify the outcome.
     */
    private async executePage<T>(
        apiFunction: () => Promise<T>,
        policy: CallPolicy,
        extraAbort?: AbortSignal
    ): Promise<T> {
        const result = await this.execute<T>(apiFunction, {
            priority: policy.priority,
            context: policy.context,
            abortSignal: mergeAbortSignals([policy.abortSignal, extraAbort]),
            throwOnError: true,
            gatewayMaxRetries: this.paginationGatewayMaxRetries,
        })
        if (result === undefined) {
            throw new Error('Paginated page returned no data')
        }
        return result
    }

    /**
     * Sequential/searchAfter page loader: same-position retries count toward the gateway streak,
     * then one cooldown and one probe at that position.
     */
    private async loadWithCircuit<T>(
        fetchOnce: () => Promise<T>,
        circuit: PaginationCircuit,
        positionLabel: string,
        fail: () => PaginationError
    ): Promise<T> {
        while (true) {
            try {
                const page = await fetchOnce()
                circuit.recordSuccess()
                return page
            } catch (error: unknown) {
                if (isAbortError(error)) {
                    throw fail()
                }
                if (!isGatewayFailure(error)) {
                    throw fail()
                }
                const action = circuit.noteGatewayFailure()
                if (action === 'continue') {
                    continue
                }
                if (action === 'open') {
                    circuit.abortAfterSecondStreak(positionLabel)
                    throw fail()
                }
                circuit.shed(positionLabel)
                try {
                    await circuit.cooldown()
                } catch {
                    throw fail()
                }
                circuit.beginProbe(positionLabel)
                try {
                    const probed = await fetchOnce()
                    circuit.recordSuccess()
                    circuit.resumeAfterSuccessfulProbe()
                    return probed
                } catch (probeError: unknown) {
                    if (!isAbortError(probeError)) {
                        circuit.abortAfterFailedProbe(positionLabel)
                    }
                    throw fail()
                }
            }
        }
    }

    private async fetchSequentialOffsetPages<T>(
        fetchPage: (limit: number, offset: number) => Promise<T[]>,
        config: {
            effectivePageSize: number
            baseLimit?: number | null
            paginateLimit?: number
            context?: string
            onProgress?: (loaded: number, total?: number) => void
            abortSignal?: AbortSignal
        }
    ): Promise<T[]> {
        const { effectivePageSize: eps, baseLimit: bl, paginateLimit: ol, context, onProgress } = config
        const hasExplicitBaseLimit = bl != null
        const initialLimit = hasExplicitBaseLimit && bl! < eps ? bl! : eps
        const all: T[] = []
        const circuit = this.createPaginationCircuit({ context, abortSignal: config.abortSignal })
        const fail = (offset: number) =>
            new PaginationError(
                offset === 0 && all.length === 0
                    ? `Pagination failed on initial page (${context ?? 'paginate'}).`
                    : `Pagination failed at offset ${offset} (${context ?? 'paginate'}). ${all.length} item(s) collected before failure.`,
                all.length
            )
        const load = (limit: number, offset: number) =>
            this.loadWithCircuit(
                () => fetchPage(limit, offset),
                circuit,
                `offset ${offset}`,
                () => fail(offset)
            )

        const firstPage = await load(initialLimit, 0)
        all.push(...firstPage)

        const effectiveLimit = ol ?? (hasExplicitBaseLimit ? bl! : undefined)
        const reportProgress = () => onProgress?.(all.length, effectiveLimit)
        reportProgress()
        if (firstPage.length > 0) await yieldToEventLoop()
        if (firstPage.length < initialLimit || (effectiveLimit != null && all.length >= effectiveLimit)) {
            return effectiveLimit != null && all.length > effectiveLimit ? all.slice(0, effectiveLimit) : all
        }

        let offset = firstPage.length
        while (true) {
            if (effectiveLimit != null && all.length >= effectiveLimit) {
                if (all.length > effectiveLimit) all.splice(effectiveLimit)
                break
            }
            const remainingLimit = effectiveLimit != null ? effectiveLimit - all.length : undefined
            const requestLimit = remainingLimit != null && remainingLimit < eps ? remainingLimit : eps
            const pageData = await load(requestLimit, offset)
            if (!pageData.length) break
            all.push(...pageData)
            reportProgress()
            await yieldToEventLoop()
            if (pageData.length < requestLimit) break
            offset += requestLimit
        }
        if (effectiveLimit != null && all.length > effectiveLimit) all.splice(effectiveLimit)
        reportProgress()
        return all
    }

    private async paginateSequential<T>(
        fn: (api: IscApiSurface, params: any) => Promise<{ data: T[] }>,
        paginate: { baseParams?: Record<string, unknown>; limit?: number },
        policy: CallPolicy
    ): Promise<T[]> {
        const api = this.apiSurface
        const eps = Math.min(this.pageSize, this.sailPointListMax)
        const bp = paginate.baseParams ?? {}
        const ctx = (suffix: string) => (policy.context ? `${policy.context} ${suffix}` : suffix)

        return this.fetchSequentialOffsetPages<T>(
            async (limit, offset) => {
                const response = await this.executePage<{ data: T[] }>(() => fn(api, { ...bp, limit, offset }), {
                    priority: policy.priority,
                    context: ctx(offset === 0 ? '[page 1, offset 0]' : `[page, offset ${offset}]`),
                    abortSignal: policy.abortSignal,
                })
                return response.data ?? Promise.reject(new Error('Paginated page returned no data'))
            },
            {
                effectivePageSize: eps,
                baseLimit: readNumber(bp, 'limit'),
                paginateLimit: paginate.limit,
                context: policy.context,
                onProgress: policy.onPageProgress,
                abortSignal: policy.abortSignal,
            }
        )
    }

    private async *yieldParallelOffsetPages<T>(
        initialItems: T[],
        totalCount: number,
        fetchCeiling: number,
        effectivePageSize: number,
        batchSize: number,
        fetchPageAtOffset: (offset: number, extraAbort?: AbortSignal) => Promise<T[]>,
        fail: (offset: number, loadedBeforeFailure: number) => PaginationError,
        onPageComplete: (loaded: number, total?: number) => void,
        circuit: PaginationCircuit,
        abortSignal?: AbortSignal
    ): AsyncGenerator<T[], void, unknown> {
        if (!totalCount || totalCount <= initialItems.length) {
            return
        }

        const offsets: number[] = []
        for (let offset = initialItems.length; offset < fetchCeiling; offset += effectivePageSize) {
            offsets.push(offset)
        }

        yield* this.runParallelOffsetWindow(
            offsets,
            batchSize,
            initialItems.length,
            fetchCeiling,
            fetchPageAtOffset,
            fail,
            onPageComplete,
            circuit,
            abortSignal
        )
    }

    private async *paginateParallelForCall<T>(
        fn: (api: IscApiSurface, params: any) => Promise<{ data: T[]; headers?: any }>,
        paginate: { baseParams?: Record<string, unknown>; limit?: number; batchSize?: number },
        policy: CallPolicy
    ): AsyncGenerator<T[], void, unknown> {
        const api = this.apiSurface
        const eps = Math.min(this.pageSize, this.sailPointListMax)
        const bs = paginate.batchSize ?? this.parallelBatchSize
        const bp = paginate.baseParams ?? {}
        const limit = paginate.limit
        const ctx = (suffix: string) => (policy.context ? `${policy.context} ${suffix}` : suffix)
        const circuit = this.createPaginationCircuit(policy)
        const failInit = () => new PaginationError(`Pagination failed on initial page (${policy.context ?? 'paginate'}).`, 0)

        const initialResponse = await this.loadWithCircuit(
            () =>
                this.executePage<{ data: T[]; headers?: any }>(
                    () => fn(api, { ...bp, limit: eps, offset: 0, count: true }),
                    {
                        priority: policy.priority,
                        context: ctx('[parallel-init]'),
                        abortSignal: policy.abortSignal,
                    }
                ),
            circuit,
            'offset 0',
            failInit
        )

        const initialItems = initialResponse.data || []
        if (limit != null && initialItems.length >= limit) {
            policy.onPageProgress?.(Math.min(initialItems.length, limit), limit)
            yield initialItems
            return
        }

        const totalCount = parseInt(initialResponse.headers?.['x-total-count'] || '0', 10)
        const fetchCeiling = limit != null ? Math.min(totalCount, limit) : totalCount
        policy.onPageProgress?.(initialItems.length, totalCount > 0 ? fetchCeiling : undefined)
        yield initialItems

        yield* this.yieldParallelOffsetPages(
            initialItems,
            totalCount,
            fetchCeiling,
            eps,
            bs,
            async (offset, extraAbort) => {
                const response = await this.executePage<{ data: T[] }>(
                    () => fn(api, { ...bp, limit: eps, offset }),
                    {
                        priority: policy.priority,
                        context: ctx(`[offset ${offset}]`),
                        abortSignal: policy.abortSignal,
                    },
                    extraAbort
                )
                return response.data ?? Promise.reject(new Error('Paginated page returned no data'))
            },
            (offset, loaded) =>
                new PaginationError(
                    `Pagination failed at offset ${offset} (${policy.context ?? 'paginate'}). ${loaded} item(s) collected before failure.`,
                    loaded
                ),
            (loaded, total) => policy.onPageProgress?.(loaded, total),
            circuit,
            policy.abortSignal
        )
    }

    /**
     * Fetch offset pages with a sliding window: up to `windowSize` in-flight requests;
     * schedules the next offset when any page completes. Yields pages in ascending offset order.
     */
    private async *runParallelOffsetWindow<T>(
        offsets: number[],
        windowSize: number,
        initialLoaded: number,
        progressTotal: number | undefined,
        fetchPage: (offset: number, extraAbort?: AbortSignal) => Promise<T[]>,
        fail: (offset: number, loadedBeforeFailure: number) => PaginationError,
        onPageComplete: (loaded: number, total?: number) => void,
        circuit: PaginationCircuit,
        abortSignal?: AbortSignal
    ): AsyncGenerator<T[], void, unknown> {
        if (abortSignal?.aborted || offsets.length === 0) {
            return
        }

        const scheduler = new OffsetPageScheduler(
            offsets,
            windowSize,
            initialLoaded,
            progressTotal,
            fetchPage,
            fail,
            onPageComplete,
            circuit,
            abortSignal
        )
        yield* scheduler.run()
    }

    private async paginateSearchAfter<T>(
        fn: (api: IscApiSurface, params: { search: any; limit: number; count?: boolean }) => Promise<{ data: unknown[] }>,
        paginate: { search: any },
        policy: CallPolicy
    ): Promise<T[]> {
        const api = this.apiSurface
        const ps = this.pageSize
        const bs = { ...paginate.search, sort: ['id'] }
        let sa: string[] | undefined, first = true, more = true, pn = 1
        const all: T[] = []
        const circuit = this.createPaginationCircuit(policy)
        while (more) {
            if (policy.abortSignal?.aborted) break
            const pc = policy.context ? `${policy.context} [page ${pn}]` : `search [page ${pn}]`
            const cursorLabel = sa ? `searchAfter ${sa.join(',')}` : 'searchAfter start'
            const r = await this.loadWithCircuit(
                () =>
                    this.executePage<{ data: unknown[] }>(
                        () => fn(api, { search: sa ? { ...bs, searchAfter: sa } : bs, limit: ps, count: first ? true : undefined }),
                        { priority: policy.priority, context: pc, abortSignal: policy.abortSignal }
                    ),
                circuit,
                cursorLabel,
                () =>
                    new PaginationError(
                        `Search pagination failed at page ${pn} (${policy.context ?? 'search'}). ${all.length} item(s) collected before failure.`,
                        all.length
                    )
            )
            const items = (r.data ?? []) as T[]
            if (items.length) all.push(...items)
            policy.onPageProgress?.(all.length, undefined)
            if (items.length) await yieldToEventLoop()
            if (items.length < ps) { more = false } else { const li = (items[items.length - 1] as { id?: string }).id; if (!li) { more = false } else { sa = [li] } }
            first = false; pn++
        }
        return all
    }

    // -------------------------------------------------------------------------
    // Generic Execution Helpers
    // -------------------------------------------------------------------------

    /**
     * Execute a single API function, optionally through the queue depending on configuration.
     * Returns the result directly as returned by the function (queue preserves the return type).
     * Returns undefined and logs the error if the API call fails.
     */
    private async execute<TResponse>(
        apiFunction: () => Promise<TResponse>,
        policy: CallPolicy = {}
    ): Promise<TResponse | undefined> {
        const priority = policy.priority ?? QueuePriority.MEDIUM
        const { context, abortSignal, throwOnError = false, noRetry, gatewayMaxRetries } = policy
        const fn = () => {
            const timeoutController = this.requestTimeoutMs ? new AbortController() : undefined
            let timeoutId: ReturnType<typeof setTimeout> | undefined

            if (timeoutController && this.requestTimeoutMs) {
                timeoutId = setTimeout(() => {
                    timeoutController.abort(new Error(`Request timed out after ${this.requestTimeoutMs}ms`))
                }, this.requestTimeoutMs)
            }

            const mergedSignal = mergeAbortSignals([abortSignal, timeoutController?.signal])

            const run = () => {
                if (mergedSignal?.aborted) {
                    return Promise.reject(mergedSignal.reason ?? new Error('Aborted'))
                }
                return invokeAbortable(() => runWithRequestAbortSignal(mergedSignal, apiFunction), mergedSignal)
            }

            return run().finally(() => {
                if (timeoutId) clearTimeout(timeoutId)
            })
        }

        try {
            if (this.queue) {
                return await this.queue.enqueue(() => fn(), {
                    priority,
                    abortSignal,
                    label: context,
                    noRetry,
                    gatewayMaxRetries,
                })
            }

            return await fn()
        } catch (error: unknown) {
            // Extract meaningful details from API errors (axios-style responses)
            const err = error as {
                response?: { status?: number; statusText?: string; data?: { message?: string; detailCode?: string } }
            }
            const status = err.response?.status
            const statusText = err.response?.statusText
            const apiMessage = err.response?.data?.message || err.response?.data?.detailCode
            const baseMessage = error instanceof Error ? error.message : String(error)
            let errorDetail = baseMessage
            if (status) {
                errorDetail = `HTTP ${status}${statusText ? ` ${statusText}` : ''}${apiMessage ? ` - ${apiMessage}` : ''}`
            }

            const contextHint = context ? ` (${context})` : ''
            this.log.error(`API request failed${contextHint}: ${errorDetail}`)
            if (throwOnError) {
                throw error
            }
            return undefined
        }
    }

    /**
     * Paginate API calls with optional queue support.
     * Each page request is routed through the queue (if enabled) for proper rate limiting and concurrency control.
     * The pageSize from config determines the page size.
     * Base parameters are merged with pagination parameters (limit/offset) automatically.
     * Pages are fetched sequentially to ensure correct detection of the end of data.
     *
     * @param callFunction - Function that accepts request parameters and returns a promise with { data: T[] }
     * @param baseParameters - Base request parameters (filters, etc.) that will be merged with pagination params
     * @param priority - Optional priority for the page requests (default: NORMAL, only used if queue is enabled)
     * @param context - Optional hint for error logs to identify which API call failed (e.g. "listSources")
     * @returns Promise resolving to all paginated data
     *
     * @example
     * ```typescript
     * const accounts = await client.paginate(
     *   (params) => client.accountsApi.listAccounts(params),
     *   { filters: 'sourceId eq "123"' }
     * )
     * ```
     */
    private async paginate<T, TRequestParams = any>(
        callFunction: (requestParameters: TRequestParams) => Promise<{ data: T[] }>,
        baseParameters: Partial<TRequestParams> = {},
        priority: QueuePriority = QueuePriority.MEDIUM,
        context?: string
    ): Promise<T[]> {
        const effectivePageSize = Math.min(this.pageSize, this.sailPointListMax)
        const pageContext = (offset: number) =>
            context
                ? `${context} ${offset === 0 ? '[page 1, offset 0]' : `[page, offset ${offset}]`}`
                : offset === 0
                  ? 'list [page 1, offset 0]'
                  : `list [page, offset ${offset}]`

        try {
            return await this.fetchSequentialOffsetPages<T>(
                async (limit, offset) => {
                    const params = { ...baseParameters, limit, offset } as TRequestParams
                    const response = await this.executePage<{ data: T[] }>(() => callFunction(params), {
                        priority,
                        context: pageContext(offset),
                    })
                    return response.data ?? Promise.reject(new Error('Paginated page returned no data'))
                },
                {
                    effectivePageSize,
                    baseLimit: readNumber(baseParameters, 'limit'),
                    context,
                }
            )
        } catch (error) {
            if (error instanceof PaginationError) {
                const ctx = context ?? 'paginate'
                if (error.itemsCollected === 0) {
                    throw new Error(`Pagination failed on initial page (${ctx}). The API call returned no data.`, { cause: error })
                }
                throw new Error(error.message, { cause: error })
            }
            throw error
        }
    }

    /**
     * Paginate SearchApi operations with optional queue support.
     * Each page request is routed through the queue (if enabled) for proper rate limiting and concurrency control.
     * Respects SailPoint search semantics:
     * - Query is sorted by id
     * - Pages are defined by the searchAfter property (not offset)
     * - The first call uses count=true so X-Total-Count is populated
     *
     * @param search - The search object
     * @param priority - Optional priority for the page requests (default: NORMAL, only used if queue is enabled)
     * @param context - Optional hint for error logs to identify which API call failed
     * @returns Promise resolving to all paginated data
     *
     * @example
     * ```typescript
     * const search: Search = {
     *   indices: ['identities'],
     *   query: { query: '*' }
     * }
     * const identities = await client.paginateSearchApi<IdentityDocument>(search)
     * ```
     */
    private async paginateSearchApi<T>(
        search: Search,
        priority: QueuePriority = QueuePriority.MEDIUM,
        context?: string
    ): Promise<T[]> {
        const allItems: T[] = []
        for await (const page of this.paginateSearchApiGenerator<T>(search, priority, context)) {
            allItems.push(...page)
        }
        return allItems
    }

    /**
     * Paginate SearchApi operations using a generator to yield pages as they arrive.
     * Use this for large datasets where buffering all results in memory is not feasible.
     * Respects SailPoint search semantics (searchAfter).
     *
     * @param search - The search object
     * @param priority - Optional priority for the page requests
     * @param context - Optional hint for error logs
     * @param abortSignal - Signal to abort the operation
     * @param onPageProgress - Optional callback with loaded and known total counts
     * @yields Arrays of items (pages) as they are fetched
     */
    public async *paginateSearchApiGenerator<T>(
        search: Search,
        priority: QueuePriority = QueuePriority.MEDIUM,
        context?: string,
        abortSignal?: AbortSignal,
        onPageProgress?: (loaded: number, total?: number) => void
    ): AsyncGenerator<T[], void, unknown> {
        const pageSize = this.pageSize
        const baseSearch: Search = {
            ...search,
            sort: ['id'], // Ensure sort by id for searchAfter
        }

        let searchAfter: string[] | undefined
        let isFirstPage = true
        let hasMore = true
        let pageNum = 1
        let loaded = 0
        let total: number | undefined

        while (hasMore) {
            if (abortSignal?.aborted) return

            const pageContext = context ? `${context} [page ${pageNum}]` : `search [page ${pageNum}]`
            const response = await this.execute<{ data: unknown[]; headers?: any }>(
                () =>
                    this.adapter.searchApi.searchPost({
                        search: searchAfter ? { ...baseSearch, searchAfter } : baseSearch,
                        limit: pageSize,
                        count: isFirstPage ? true : undefined,
                    }),
                { priority, context: pageContext, abortSignal }
            )

            const items = (response?.data ?? []) as T[]
            loaded += items.length
            if (isFirstPage) {
                const parsedTotal = Number.parseInt(String(response?.headers?.['x-total-count'] ?? ''), 10)
                total = Number.isFinite(parsedTotal) ? parsedTotal : undefined
            }
            onPageProgress?.(loaded, total)
            if (items.length > 0) {
                yield items
            }

            if (items.length < pageSize) {
                hasMore = false
            } else {
                const lastId = (items[items.length - 1] as { id?: string }).id
                if (!lastId) {
                    hasMore = false
                } else {
                    searchAfter = [lastId]
                }
            }

            isFirstPage = false
            pageNum += 1
        }
    }

    /**
     * Get queue statistics (returns empty stats if queue is disabled)
     */
    public getQueueStats(): QueueStats {
        if (!this.queue) {
            return {
                totalProcessed: 0,
                totalFailed: 0,
                totalRetries: 0,
                averageWaitTime: 0,
                averageProcessingTime: 0,
                queueLength: 0,
                activeRequests: 0,
                rateLimitWaitCount: 0,
            }
        }
        return this.queue.getStats()
    }

    /**
     * Returns sanitised info for all items currently waiting in queue or actively executing.
     * Returns empty arrays when the queue is disabled.
     */
    public getQueueItems(): { pending: QueuedItemInfo[]; active: QueuedItemInfo[] } {
        if (!this.queue) {
            return { pending: [], active: [] }
        }
        return {
            pending: this.queue.getPendingItems(),
            active: this.queue.getActiveItems(),
        }
    }

    /**
     * Release resources held by this client (queue).
     * Safe to call multiple times.
     */
    public dispose(): void {
        this.queue?.stop()
    }

    /**
     * Paginate API calls in parallel using a generator to yield pages as they arrive.
     * Use this for large datasets where sequential pagination is too slow and excessive memory usage
     * from accumulating all results is a concern.
     *
     * Strategy:
     * 1. Fetch the first page with count=true to get X-Total-Count.
     * 2. Calculate remaining pages/offsets (capped by `limit` when provided).
     * 3. Fetch remaining pages in parallel batches to maximize throughput.
     * 4. Yield items from each page as soon as the request completes.
     *
     * @param callFunction - Function that accepts request parameters and returns a promise with { data: T[] }
     * @param baseParameters - Base request parameters
     * @param priority - Queue priority
     * @param context - Context hint for logs
     * @param abortSignal - Signal to abort the operation
     * @param limit - Maximum number of items to fetch. When set, only the pages needed
     *               to reach this count are requested, avoiding unnecessary API calls.
     * @yields Arrays of items (pages) as they are fetched
     */
    private async *paginateParallel<T, TRequestParams = any>(
        callFunction: (requestParameters: TRequestParams) => Promise<{ data: T[]; headers?: any }>,
        baseParameters: Partial<TRequestParams> = {},
        priority: QueuePriority = QueuePriority.MEDIUM,
        context?: string,
        abortSignal?: AbortSignal,
        limit?: number
    ): AsyncGenerator<T[], void, unknown> {
        const effectivePageSize = Math.min(this.pageSize, this.sailPointListMax)
        const batchSize = this.parallelBatchSize
        const initialCtx = context ? `${context} [parallel-init]` : 'list [parallel-init]'
        const circuit = this.createPaginationCircuit({ context, abortSignal })

        const initialResponse = await this.loadWithCircuit(
            () =>
                this.executePage<{ data: T[]; headers?: any }>(
                    () =>
                        callFunction({
                            ...baseParameters,
                            limit: effectivePageSize,
                            offset: 0,
                            count: true,
                        } as TRequestParams),
                    { priority, context: initialCtx, abortSignal }
                ),
            circuit,
            'offset 0',
            () => new PaginationError(`Pagination failed on initial page (${context ?? 'paginate'}).`, 0)
        )

        const initialItems = initialResponse.data || []
        yield initialItems
        if (limit !== undefined && initialItems.length >= limit) {
            return
        }

        const totalCount = parseInt(initialResponse.headers?.['x-total-count'] || '0', 10)
        const fetchCeiling = limit !== undefined ? Math.min(totalCount, limit) : totalCount

        yield* this.yieldParallelOffsetPages(
            initialItems,
            totalCount,
            fetchCeiling,
            effectivePageSize,
            batchSize,
            async (offset, extraAbort) => {
                const params = { ...baseParameters, limit: effectivePageSize, offset } as TRequestParams
                const pageCtx = context ? `${context} [offset ${offset}]` : `list [offset ${offset}]`
                const response = await this.executePage<{ data: T[] }>(() => callFunction(params), {
                    priority,
                    context: pageCtx,
                    abortSignal,
                }, extraAbort)
                return response.data ?? Promise.reject(new Error('Paginated page returned no data'))
            },
            (offset, loaded) =>
                new PaginationError(
                    `Pagination failed at offset ${offset} (${context ?? 'paginate'}). ${loaded} item(s) collected before failure.`,
                    loaded
                ),
            () => {},
            circuit,
            abortSignal
        )
    }
}
