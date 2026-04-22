import FormData from 'form-data'
import https from 'https'
import { ApiQueue } from './queue'
import { QueueConfig, QueuePriority, QueueStats } from './types'
import { LogService } from '../logService'
import { FusionConfig } from '../../model/config'
import {
    Configuration,
    Search,
    AccountsV2025Api,
    IdentitiesV2025Api,
    IdentityAttributesV2025Api,
    IdentityProfilesV2025Api,
    CustomFormsV2025Api,
    EntitlementsV2025Api,
    GovernanceGroupsV2025Api,
    TaskManagementV2025Api,
    SearchApi,
    TransformsApi,
    SourcesV2025Api,
    WorkflowsV2025Api,
} from 'sailpoint-api-client'
import { readNumber } from '../../utils/safeRead'
import { createRetriesConfig } from './helpers'
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
    protected readonly queue: ApiQueue | null
    public readonly config: Configuration
    protected readonly enableQueue: boolean
    private readonly pageSize: number
    private readonly sailPointListMax: number
    private readonly statsLoggingIntervalMs: number
    private readonly requestTimeoutMs?: number
    /** Number of pages to fetch in parallel inside paginateParallel. */
    private readonly parallelBatchSize: number
    /** Handle for the stats logging interval so it can be cleared in dispose(). */
    private statsLoggingInterval?: ReturnType<typeof setInterval>

    // Lazy-loaded API instances
    private _accountsApi?: AccountsV2025Api
    private _identitiesApi?: IdentitiesV2025Api
    private _searchApi?: SearchApi
    private _sourcesApi?: SourcesV2025Api
    private _customFormsApi?: CustomFormsV2025Api
    private _workflowsApi?: WorkflowsV2025Api
    private _entitlementsApi?: EntitlementsV2025Api
    private _transformsApi?: TransformsApi
    private _governanceGroupsApi?: GovernanceGroupsV2025Api
    private _taskManagementApi?: TaskManagementV2025Api
    private _identityProfilesApi?: IdentityProfilesV2025Api
    private _identityAttributesApi?: IdentityAttributesV2025Api

    constructor(
        fusionConfig: FusionConfig,
        protected log: LogService
    ) {
        const tokenUrl = new URL(fusionConfig.baseurl).origin + fusionConfig.tokenUrlPath

        // Determine if queue and retry are enabled
        this.enableQueue = fusionConfig.enableQueue ?? false
        const enableRetry = fusionConfig.enableRetry ?? false

        // Only enable retry in axios config if enableRetry is true
        const maxRetries = enableRetry ? (fusionConfig.maxRetries ?? fusionConfig.retriesConstant) : 0
        // When the queue is enabled it acts as the sole retry authority (exponential backoff + jitter
        // via calculateRetryDelay). Enabling axios-retry at the same time would cause a single failed
        // request to be retried by axios first and then retried again by the queue after axios
        // exhausts its own budget — multiplying the effective retry count unexpectedly.
        const axiosRetries = this.enableQueue && enableRetry ? 0 : maxRetries
        const retriesConfig = createRetriesConfig(axiosRetries)

        // Inject https agent with keepAlive: true to reuse TCP connections
        const agent = new https.Agent({ keepAlive: true })

        this.config = new Configuration({ ...fusionConfig, tokenUrl, baseOptions: { httpsAgent: agent } } as any)
        this.config.retriesConfig = retriesConfig
        // form-data extends EventEmitter; with axios-retry, retries add error listeners to the same
        // FormData instance. Set formDataCtor so multipart API calls create instances with higher limit.
        this.config.formDataCtor = class extends FormData {
            constructor() {
                super()
                if (typeof this.setMaxListeners === 'function') this.setMaxListeners(25)
            }
        }

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
        this.statsLoggingIntervalMs = fusionConfig.statsLoggingIntervalMs

        // Only initialize the queue if enableQueue is true
        if (this.enableQueue) {
            const requestsPerSecond = fusionConfig.requestsPerSecond ?? fusionConfig.requestsPerSecondConstant
            const maxConcurrentRequests = fusionConfig.maxConcurrentRequests ?? Math.max(10, requestsPerSecond * 2)

            // parallelBatchSize caps concurrent page fetches in paginateParallel at the
            // smaller of the configured value and maxConcurrentRequests.
            this.parallelBatchSize = Math.min(fusionConfig.parallelBatchSize, maxConcurrentRequests)

            const queueConfig: QueueConfig = {
                requestsPerSecond,
                maxConcurrentRequests,
                maxRetries: enableRetry ? maxRetries : 0,
                enablePriority: fusionConfig.enablePriority ?? true,
            }

            this.queue = new ApiQueue(queueConfig)
            this.startStatsLogging()
            this.log.info(
                `API client ready: queue ${queueConfig.requestsPerSecond} req/s, ` +
                    `max concurrent: ${queueConfig.maxConcurrentRequests}, retries: ${queueConfig.maxRetries}, keep-alive: true`
            )
        } else {
            this.queue = null
            this.parallelBatchSize = fusionConfig.parallelBatchSize
            this.log.info('API client ready (direct calls, no queue, keep-alive: true)')
        }
    }

    // -------------------------------------------------------------------------
    // API Instance Getters (Lazy Initialization)
    // -------------------------------------------------------------------------

    public get accountsApi(): AccountsV2025Api {
        return (this._accountsApi ??= new AccountsV2025Api(this.config))
    }

    public get identitiesApi(): IdentitiesV2025Api {
        return (this._identitiesApi ??= new IdentitiesV2025Api(this.config))
    }

    public get searchApi(): SearchApi {
        return (this._searchApi ??= new SearchApi(this.config))
    }

    public get sourcesApi(): SourcesV2025Api {
        return (this._sourcesApi ??= new SourcesV2025Api(this.config))
    }

    public get customFormsApi(): CustomFormsV2025Api {
        return (this._customFormsApi ??= new CustomFormsV2025Api(this.config))
    }

    public get workflowsApi(): WorkflowsV2025Api {
        return (this._workflowsApi ??= new WorkflowsV2025Api(this.config))
    }

    public get entitlementsApi(): EntitlementsV2025Api {
        return (this._entitlementsApi ??= new EntitlementsV2025Api(this.config))
    }

    public get transformsApi(): TransformsApi {
        return (this._transformsApi ??= new TransformsApi(this.config))
    }

    public get governanceGroupsApi(): GovernanceGroupsV2025Api {
        return (this._governanceGroupsApi ??= new GovernanceGroupsV2025Api(this.config))
    }

    public get taskManagementApi(): TaskManagementV2025Api {
        return (this._taskManagementApi ??= new TaskManagementV2025Api(this.config))
    }

    public get identityProfilesApi(): IdentityProfilesV2025Api {
        return (this._identityProfilesApi ??= new IdentityProfilesV2025Api(this.config))
    }

    public get identityAttributesApi(): IdentityAttributesV2025Api {
        return (this._identityAttributesApi ??= new IdentityAttributesV2025Api(this.config))
    }

    /**
     * Returns the internal queue instance, or null if queue is disabled.
     */
    public getQueue(): ApiQueue | null {
        return this.queue
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
     */
    public async execute<TResponse>(
        apiFunction: () => Promise<TResponse>,
        priority: QueuePriority = QueuePriority.MEDIUM,
        context?: string,
        abortSignal?: AbortSignal,
        throwOnError: boolean = false
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
                return await this.queue.enqueue(() => fn(), { priority, abortSignal })
            }

            return await fn()
        } catch (error: unknown) {
            // Extract meaningful details from API errors (axios-style responses)
            const err = error as { response?: { status?: number; statusText?: string; data?: { message?: string; detailCode?: string } } }
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
    public async paginate<T, TRequestParams = any>(
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
    public async paginateSearchApi<T>(
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
                    this.searchApi.searchPost({
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
     * Start periodic stats logging (only called when queue is enabled).
     * The interval handle is stored so it can be cleared by dispose().
     */
    protected startStatsLogging(): void {
        if (!this.queue) {
            return
        }

        this.statsLoggingInterval = setInterval(() => {
            const stats = this.queue!.getStats()
            if (stats.queueLength > 0 || stats.activeRequests > 0) {
                this.log.info(
                    `Queue Stats: ${stats.activeRequests} active, ${stats.queueLength} queued, ` +
                        `${stats.totalProcessed} processed, ${stats.totalFailed} failed, ` +
                        `avg wait: ${stats.averageWaitTime.toFixed(0)}ms, ` +
                        `avg process: ${stats.averageProcessingTime.toFixed(0)}ms`
                )
            }
        }, this.statsLoggingIntervalMs)
    }

    /**
     * Release resources held by this client (stats logging interval, queue).
     * Safe to call multiple times.
     */
    public dispose(): void {
        if (this.statsLoggingInterval !== undefined) {
            clearInterval(this.statsLoggingInterval)
            this.statsLoggingInterval = undefined
        }
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
    public async *paginateParallel<T, TRequestParams = any>(
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
