import { ApiQueue } from './queue'
import { QueuePriority, QueueStats, QueuedItemInfo, CallPolicy, PaginatePolicy, PaginationError } from './types'
import { LogService } from '../logService'
import { FusionConfig } from '../../model/config'
import { readNumber } from '../../utils/safeRead'
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
export class ClientService {
    private readonly pageSize: number
    private readonly sailPointListMax: number
    private readonly requestTimeoutMs?: number
    /** Number of pages to fetch in parallel inside paginateParallel. */
    private readonly parallelBatchSize: number
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
        const parallelBatchSize = fusionConfig.parallelBatchSize ?? 8
        const requestsPerSecond = fusionConfig.requestsPerSecond ?? fusionConfig.requestsPerSecondConstant
        const maxConcurrentRequests = fusionConfig.maxConcurrentRequests ?? Math.max(10, requestsPerSecond * 2)

        if (this.queue) {
            // parallelBatchSize caps concurrent page fetches in paginateParallel at the
            // smaller of the configured value and maxConcurrentRequests.
            this.parallelBatchSize = Math.min(parallelBatchSize, maxConcurrentRequests)

            this.log.info(
                `API client ready: queue enabled, ` +
                    `max concurrent: ${maxConcurrentRequests}, keep-alive: true`
            )
        } else {
            this.parallelBatchSize = parallelBatchSize
            this.log.info('API client ready (direct calls, no queue, keep-alive: true)')
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
            return this.execute<T>(() => fn(this._apiSurface), policy?.priority, policy?.context, policy?.abortSignal, policy?.throwOnError, policy?.noRetry)
        }
        switch (paginate.mode) {
            case 'sequential': return this._paginateSequential<T>(fn as any, paginate, policy!)
            case 'parallel': return this._paginateParallel<T>(fn as any, paginate, policy!)
            case 'searchAfter': return this._paginateSearchAfter<T>(fn as any, paginate, policy!)
        }
    }

    private get _apiSurface(): IscApiSurface {
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

    private async _paginateSequential<T>(
        fn: (api: IscApiSurface, params: any) => Promise<{ data: T[] }>,
        paginate: { baseParams?: Record<string, unknown>; limit?: number },
        policy: CallPolicy
    ): Promise<T[]> {
        const api = this._apiSurface
        const eps = Math.min(this.pageSize, this.sailPointListMax)
        const bp = paginate.baseParams ?? {}
        const bl = readNumber(bp, 'limit')
        const hel = bl != null
        const il = hel && bl < eps ? bl : eps
        const ol = paginate.limit
        const ctx = (s: string) => policy.context ? `${policy.context} ${s}` : s
        const all: T[] = []

        const r1 = await this.execute<{ data: T[] }>(() => fn(api, { ...bp, limit: il, offset: 0 }), policy.priority, ctx('[page 1, offset 0]'), policy.abortSignal)
        if (!r1) throw new PaginationError(`Pagination failed on initial page (${policy.context ?? 'paginate'}).`, 0)
        const p1 = r1.data || []
        all.push(...p1)

        const effL = ol ?? (hel ? bl : undefined)
        if (p1.length < il || (effL != null && all.length >= effL)) {
            return effL != null && all.length > effL ? all.slice(0, effL) : all
        }

        let offset = p1.length
        while (true) {
            if (effL != null && all.length >= effL) { if (all.length > effL) all.splice(effL); break }
            const rl = effL != null ? effL - all.length : undefined
            const rq = rl != null && rl < eps ? rl : eps
            const rp = await this.execute<{ data: T[] }>(() => fn(api, { ...bp, limit: rq, offset }), policy.priority, ctx(`[page, offset ${offset}]`), policy.abortSignal)
            if (!rp) throw new PaginationError(`Pagination failed at offset ${offset} (${policy.context ?? 'paginate'}). ${all.length} item(s) collected before failure.`, all.length)
            const pd = rp.data || []
            if (!pd.length) break
            all.push(...pd)
            if (pd.length < rq) break
            offset += rq
        }
        if (effL != null && all.length > effL) all.splice(effL)
        return all
    }

    private async *_paginateParallel<T>(
        fn: (api: IscApiSurface, params: any) => Promise<{ data: T[]; headers?: any }>,
        paginate: { baseParams?: Record<string, unknown>; limit?: number; batchSize?: number },
        policy: CallPolicy
    ): AsyncGenerator<T[], void, unknown> {
        const api = this._apiSurface
        const eps = Math.min(this.pageSize, this.sailPointListMax)
        const bs = paginate.batchSize ?? this.parallelBatchSize
        const bp = paginate.baseParams ?? {}
        const limit = paginate.limit
        const ctx = (s: string) => policy.context ? `${policy.context} ${s}` : s

        const r1 = await this.execute<{ data: T[]; headers?: any }>(() => fn(api, { ...bp, limit: eps, offset: 0, count: true }), policy.priority, ctx('[parallel-init]'), policy.abortSignal)
        if (!r1) throw new PaginationError(`Pagination failed on initial page (${policy.context ?? 'paginate'}).`, 0)
        const i1 = r1.data || []
        yield i1
        if (limit != null && i1.length >= limit) return
        const tc = parseInt(r1.headers?.['x-total-count'] || '0', 10)
        if (!tc || tc <= i1.length) return
        const fc = limit != null ? Math.min(tc, limit) : tc
        const offs: number[] = []
        for (let o = i1.length; o < fc; o += eps) offs.push(o)
        let coll = i1.length
        for (let i = 0; i < offs.length; i += bs) {
            if (policy.abortSignal?.aborted) return
            const bo = offs.slice(i, i + bs)
            const ps = bo.map((o) => this.execute<{ data: T[] }>(() => fn(api, { ...bp, limit: eps, offset: o }), policy.priority, ctx(`[offset ${o}]`), policy.abortSignal))
            const rs = await Promise.all(ps)
            for (let j = 0; j < rs.length; j++) {
                if (!rs[j]) throw new PaginationError(`Pagination failed at batch offset ${bo[j]} (${policy.context ?? 'paginate'}). ${coll} item(s) collected before failure.`, coll)
                if (rs[j]!.data?.length) { coll += rs[j]!.data.length; yield rs[j]!.data }
            }
        }
    }

    private async _paginateSearchAfter<T>(
        fn: (api: IscApiSurface, params: { search: any; limit: number; count?: boolean }) => Promise<{ data: unknown[] }>,
        paginate: { search: any },
        policy: CallPolicy
    ): Promise<T[]> {
        const api = this._apiSurface
        const ps = this.pageSize
        const bs = { ...paginate.search, sort: ['id'] }
        let sa: string[] | undefined, first = true, more = true, pn = 1
        const all: T[] = []
        while (more) {
            if (policy.abortSignal?.aborted) break
            const pc = policy.context ? `${policy.context} [page ${pn}]` : `search [page ${pn}]`
            const r = await this.execute<{ data: unknown[] }>(() => fn(api, { search: sa ? { ...bs, searchAfter: sa } : bs, limit: ps, count: first ? true : undefined }), policy.priority, pc, policy.abortSignal)
            if (!r) throw new PaginationError(`Search pagination failed at page ${pn} (${policy.context ?? 'search'}). ${all.length} item(s) collected before failure.`, all.length)
            const items = (r.data ?? []) as T[]
            if (items.length) all.push(...items)
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
     *
     * @param apiFunction - Async function that performs the API call
     * @param priority - Queue priority when queue is enabled
     * @param context - Optional hint for error logs (e.g. "SourceService>saveBatchCumulativeCount")
     * @param abortSignal - Optional signal to abort the request
     * @param throwOnError - Whether to rethrow on failure instead of returning undefined
     * @param noRetry - When true, the request is never retried on failure
     */
    private async execute<TResponse>(
        apiFunction: () => Promise<TResponse>,
        priority: QueuePriority = QueuePriority.MEDIUM,
        context?: string,
        abortSignal?: AbortSignal,
        throwOnError: boolean = false,
        noRetry?: boolean
    ): Promise<TResponse | undefined> {
        const fn = () => {
            if (abortSignal?.aborted) {
                return Promise.reject(new Error('Aborted'))
            }
            if (!this.requestTimeoutMs) {
                return apiFunction()
            }

            return new Promise<TResponse>((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`Request timed out after ${this.requestTimeoutMs}ms`))
                }, this.requestTimeoutMs)

                apiFunction()
                    .then((response) => {
                        clearTimeout(timer)
                        resolve(response)
                    })
                    .catch((error) => {
                        clearTimeout(timer)
                        reject(error)
                    })
            })
        }

        try {
            if (this.queue) {
                return await this.queue.enqueue(() => fn(), { priority, abortSignal, label: context, noRetry })
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
        const pageSize = this.pageSize
        // SailPoint list endpoints (e.g. list-accounts) max 250/request; always pass explicit limit
        // to avoid API-default behavior that can stop pagination early (e.g. cap at 500).
        const effectivePageSize = Math.min(pageSize, this.sailPointListMax)

        const allItems: T[] = []
        const baseLimit = readNumber(baseParameters, 'limit')
        const hasExplicitLimit = baseLimit !== undefined && baseLimit !== null
        const initialLimit = hasExplicitLimit && baseLimit < effectivePageSize ? baseLimit : effectivePageSize

        // Build initial params - always pass explicit limit for consistent pagination
        const initialParams = {
            ...baseParameters,
            limit: initialLimit,
            offset: 0,
        } as TRequestParams

        const initialResponse = await this.execute<{ data: T[] }>(
            () => callFunction(initialParams),
            priority,
            context ? `${context} [page 1, offset 0]` : 'list [page 1, offset 0]'
        )
        if (!initialResponse) {
            const ctx = context ?? 'paginate'
            throw new Error(`Pagination failed on initial page (${ctx}). The API call returned no data.`)
        }
        const initialPage = initialResponse.data || []
        allItems.push(...initialPage)

        // If the first page is smaller than requested, we already have all data
        // Or if we have an explicit limit and we've reached it
        if (initialPage.length < initialLimit || (hasExplicitLimit && allItems.length >= baseLimit)) {
            // If we have an explicit limit, trim to that limit
            if (hasExplicitLimit && allItems.length > baseLimit) {
                return allItems.slice(0, baseLimit)
            }
            return allItems
        }

        // Start with offset after the first page
        let offset = initialPage.length

        // Continue fetching pages sequentially until no more data
        // We use sequential fetching to ensure we correctly detect when we've reached the end
        while (true) {
            // Check if we've reached the explicit limit
            if (hasExplicitLimit && allItems.length >= baseLimit) {
                // Trim to the limit if we've exceeded it
                if (allItems.length > baseLimit) {
                    allItems.splice(baseLimit)
                }
                break
            }

            // Calculate how many items we still need
            const remainingLimit = hasExplicitLimit ? baseLimit - allItems.length : undefined
            const requestLimit =
                remainingLimit !== undefined && remainingLimit < effectivePageSize ? remainingLimit : effectivePageSize

            // Build page params - always pass explicit limit for consistent pagination
            const pageParams = {
                ...baseParameters,
                limit: requestLimit,
                offset,
            } as TRequestParams

            const pageResponse = await this.execute<{ data: T[] }>(
                () => callFunction(pageParams),
                priority,
                context ? `${context} [page, offset ${offset}]` : `list [page, offset ${offset}]`
            )
            if (!pageResponse) {
                const ctx = context ?? 'paginate'
                throw new Error(
                    `Pagination failed at offset ${offset} (${ctx}). ` +
                        `${allItems.length} item(s) collected before failure.`
                )
            }
            const pageData = pageResponse.data || []

            // If we get an empty page, we've reached the end
            if (pageData.length === 0) {
                break
            }

            allItems.push(...pageData)

            // If the page has fewer items than requested, it's the last page
            if (pageData.length < requestLimit) {
                break
            }

            // Move to next page
            offset += requestLimit
        }

        // Final trim to explicit limit if we have one
        if (hasExplicitLimit && allItems.length > baseLimit) {
            allItems.splice(baseLimit)
        }

        return allItems
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
     * @yields Arrays of items (pages) as they are fetched
     */
    public async *paginateSearchApiGenerator<T>(
        search: Search,
        priority: QueuePriority = QueuePriority.MEDIUM,
        context?: string,
        abortSignal?: AbortSignal
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

        while (hasMore) {
            if (abortSignal?.aborted) return

            const pageContext = context ? `${context} [page ${pageNum}]` : `search [page ${pageNum}]`
            const response = await this.execute<{ data: unknown[] }>(
                () =>
                    this.adapter.searchApi.searchPost({
                        search: searchAfter ? { ...baseSearch, searchAfter } : baseSearch,
                        limit: pageSize,
                        count: isFirstPage ? true : undefined,
                    }),
                priority,
                pageContext,
                abortSignal
            )

            const items = (response?.data ?? []) as T[]
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
        const pageSize = this.pageSize
        const effectivePageSize = Math.min(pageSize, this.sailPointListMax)
        const batchSize = this.parallelBatchSize // Concurrent page requests (configurable)

        // Initial request to get total count
        const initialParams = {
            ...baseParameters,
            limit: effectivePageSize,
            offset: 0,
            count: true,
        } as TRequestParams

        const initialCtx = context ? `${context} [parallel-init]` : 'list [parallel-init]'
        const initialResponse = await this.execute<{ data: T[]; headers?: any }>(
            () => callFunction(initialParams),
            priority,
            initialCtx,
            abortSignal
        )

        if (!initialResponse) return

        const initialItems = initialResponse.data || []
        yield initialItems

        // Stop early if consumer limit already satisfied by the first page
        if (limit !== undefined && initialItems.length >= limit) {
            return
        }

        const totalCount = parseInt(initialResponse.headers?.['x-total-count'] || '0', 10)
        // If no total count or total <= page size, we are done
        if (!totalCount || totalCount <= initialItems.length) {
            return
        }

        // Cap the fetch ceiling at the consumer's limit (when provided)
        const fetchCeiling = limit !== undefined ? Math.min(totalCount, limit) : totalCount

        // Calculate offsets for remaining pages
        const offsets: number[] = []
        for (let offset = initialItems.length; offset < fetchCeiling; offset += effectivePageSize) {
            offsets.push(offset)
        }

        // Process offsets in batches
        for (let i = 0; i < offsets.length; i += batchSize) {
            if (abortSignal?.aborted) return

            const batchOffsets = offsets.slice(i, i + batchSize)
            const promises = batchOffsets.map((offset) => {
                const params = {
                    ...baseParameters,
                    limit: effectivePageSize,
                    offset,
                } as TRequestParams
                const ctx = context ? `${context} [offset ${offset}]` : `list [offset ${offset}]`
                return this.execute<{ data: T[] }>(() => callFunction(params), priority, ctx, abortSignal)
            })

            const responses = await Promise.all(promises)
            for (const response of responses) {
                if (response?.data && response.data.length > 0) {
                    yield response.data
                }
            }
        }
    }
}
