import FormData from 'form-data'
import https from 'https'
import { LogService } from '../logService'
import { LimiterService, Priority } from '../limiterService'
import type { LimiterStats } from '../limiterService'
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

export { Priority } from '../limiterService'
/**
 * ClientService provides a lean, centralized client for API operations.
 *
 * Responsibilities:
 * - Configuration and limiter management
 * - Generic execution helpers (execute, paginate, paginateSearchApi)
 * - Lazy API instance provisioning
 *
 * Domain-specific operations should live in their respective services
 * (SourceService, IdentityService, etc.) which use this client.
 */
export class ClientService {
    protected readonly limiter: LimiterService
    public readonly config: Configuration
    private readonly pageSize: number
    private readonly sailPointListMax: number
    private readonly statsLoggingIntervalMs: number
    private readonly requestTimeoutMs?: number
    private readonly paginateParallelWindowSize: number
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
        protected log: LogService,
        limiter?: LimiterService
    ) {
        const tokenUrl = new URL(fusionConfig.baseurl).origin + fusionConfig.tokenUrlPath

        // Retries are owned by the Bottleneck api limiter; avoid double-retry in axios
        const retriesConfig = createRetriesConfig(0)

        const agent = new https.Agent({ keepAlive: true })

        this.config = new Configuration({ ...fusionConfig, tokenUrl, baseOptions: { httpsAgent: agent } } as any)
        this.config.retriesConfig = retriesConfig
        this.config.formDataCtor = class extends FormData {
            constructor() {
                super()
                if (typeof this.setMaxListeners === 'function') this.setMaxListeners(25)
            }
        }

        this.requestTimeoutMs =
            fusionConfig.provisioningTimeout && fusionConfig.provisioningTimeout > 0
                ? fusionConfig.provisioningTimeout * 1000
                : undefined

        this.pageSize = fusionConfig.pageSize
        this.sailPointListMax = fusionConfig.sailPointListMax
        this.statsLoggingIntervalMs = fusionConfig.statsLoggingIntervalMs
        const apiMax = fusionConfig.apiMaxConcurrent ?? 10
        const objectMax = fusionConfig.objectMaxConcurrent ?? 50
        this.paginateParallelWindowSize = Math.max(1, apiMax * 2)

        this.limiter = limiter ?? new LimiterService({ apiMaxConcurrent: apiMax, objectMaxConcurrent: objectMax })

        this.startStatsLogging()

        this.log.info(
            `API client ready: limiter 100/10s reservoir, max concurrent api: ${apiMax}, object: ${objectMax}, axios retries: 0, keep-alive: true`
        )
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

    public getLimiters(): LimiterService {
        return this.limiter
    }

    // -------------------------------------------------------------------------
    // Generic Execution Helpers
    // -------------------------------------------------------------------------

    public async execute<TResponse>(
        apiFunction: () => Promise<TResponse>,
        priority: Priority = Priority.MEDIUM,
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

        const scheduleOpts: {
            priority: number
            expiration?: number
            id?: string
        } = { priority, id: context, expiration: this.requestTimeoutMs }

        try {
            if (abortSignal) {
                return await new Promise<TResponse | undefined>((resolve, reject) => {
                    const onAbort = () => reject(new Error('Aborted'))
                    abortSignal.addEventListener('abort', onAbort, { once: true })
                    this.limiter.api
                        .schedule(scheduleOpts, () => fn())
                        .then((v) => {
                            abortSignal.removeEventListener('abort', onAbort)
                            resolve(v)
                        })
                        .catch((e) => {
                            abortSignal.removeEventListener('abort', onAbort)
                            reject(e)
                        })
                })
            }
            return await this.limiter.api.schedule(scheduleOpts, () => fn())
        } catch (error: unknown) {
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
     * Paginate API calls. Each page request is routed through the API limiter.
     */
    public async paginate<T, TRequestParams = any>(
        callFunction: (requestParameters: TRequestParams) => Promise<{ data: T[] }>,
        baseParameters: Partial<TRequestParams> = {},
        priority: Priority = Priority.MEDIUM,
        context?: string
    ): Promise<T[]> {
        const pageSize = this.pageSize
        const effectivePageSize = Math.min(pageSize, this.sailPointListMax)

        const allItems: T[] = []
        const baseLimit = readNumber(baseParameters, 'limit')
        const hasExplicitLimit = baseLimit !== undefined && baseLimit !== null
        const initialLimit = hasExplicitLimit && baseLimit < effectivePageSize ? baseLimit : effectivePageSize

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

        if (initialPage.length < initialLimit || (hasExplicitLimit && allItems.length >= baseLimit)) {
            if (hasExplicitLimit && allItems.length > baseLimit) {
                return allItems.slice(0, baseLimit)
            }
            return allItems
        }

        let offset = initialPage.length

        while (true) {
            if (hasExplicitLimit && allItems.length >= baseLimit) {
                if (allItems.length > baseLimit) {
                    allItems.splice(baseLimit)
                }
                break
            }

            const remainingLimit = hasExplicitLimit ? baseLimit - allItems.length : undefined
            const requestLimit =
                remainingLimit !== undefined && remainingLimit < effectivePageSize ? remainingLimit : effectivePageSize

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

            if (pageData.length === 0) {
                break
            }

            allItems.push(...pageData)

            if (pageData.length < requestLimit) {
                break
            }

            offset += requestLimit
        }

        if (hasExplicitLimit && allItems.length > baseLimit) {
            allItems.splice(baseLimit)
        }

        return allItems
    }

    public async paginateSearchApi<T>(
        search: Search,
        priority: Priority = Priority.MEDIUM,
        context?: string
    ): Promise<T[]> {
        const allItems: T[] = []
        for await (const page of this.paginateSearchApiGenerator<T>(search, priority, context)) {
            allItems.push(...page)
        }
        return allItems
    }

    public async *paginateSearchApiGenerator<T>(
        search: Search,
        priority: Priority = Priority.MEDIUM,
        context?: string,
        abortSignal?: AbortSignal
    ): AsyncGenerator<T[], void, unknown> {
        const pageSize = this.pageSize
        const baseSearch: Search = {
            ...search,
            sort: ['id'],
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

    public getLimiterStats(): LimiterStats {
        return this.limiter.stats()
    }

    protected startStatsLogging(): void {
        this.statsLoggingInterval = setInterval(() => {
            const s = this.getLimiterStats()
            // Bottleneck's RUNNING state is often very brief between polling intervals.
            // Infer "active" API work by combining running + executing snapshots.
            const inferredActive = s.api.RUNNING + s.api.EXECUTING
            if (s.api.QUEUED > 0 || s.api.RECEIVED > 0 || inferredActive > 0) {
                const memoryUsage = process.memoryUsage()
                this.log.info(
                    `API limiter: ${inferredActive} running, ${s.api.QUEUED} queued, totalRetries=${this.limiter.getTotalRetries()}, ` +
                    `memory RSS=${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB, ` +
                    `heapUsed=${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB, ` +
                    `heapTotal=${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
                )
            }
        }, this.statsLoggingIntervalMs)
    }

    public dispose(): void {
        if (this.statsLoggingInterval !== undefined) {
            clearInterval(this.statsLoggingInterval)
            this.statsLoggingInterval = undefined
        }
        this.limiter.dispose()
    }

    public async *paginateParallel<T, TRequestParams = any>(
        callFunction: (requestParameters: TRequestParams) => Promise<{ data: T[]; headers?: any }>,
        baseParameters: Partial<TRequestParams> = {},
        priority: Priority = Priority.MEDIUM,
        context?: string,
        abortSignal?: AbortSignal,
        limit?: number
    ): AsyncGenerator<T[], void, unknown> {
        const pageSize = this.pageSize
        const effectivePageSize = Math.min(pageSize, this.sailPointListMax)

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

        if (limit !== undefined && initialItems.length >= limit) {
            return
        }

        const totalCount = parseInt(initialResponse.headers?.['x-total-count'] || '0', 10)
        if (!totalCount || totalCount <= initialItems.length) {
            return
        }

        const fetchCeiling = limit !== undefined ? Math.min(totalCount, limit) : totalCount

        const offsets: number[] = []
        for (let offset = initialItems.length; offset < fetchCeiling; offset += effectivePageSize) {
            offsets.push(offset)
        }

        if (abortSignal?.aborted) return

        const windowSize = Math.min(this.paginateParallelWindowSize, offsets.length)
        let nextToSchedule = 0
        let nextToYield = 0
        const inFlight = new Map<number, Promise<{ index: number; response: { data: T[] } | undefined }>>()
        const completed = new Map<number, { data: T[] } | undefined>()

        const scheduleByIndex = (index: number): void => {
            const offset = offsets[index]
            const params = {
                ...baseParameters,
                limit: effectivePageSize,
                offset,
            } as TRequestParams
            const ctx = context ? `${context} [offset ${offset}]` : `list [offset ${offset}]`
            const request = this.execute<{ data: T[] }>(() => callFunction(params), priority, ctx, abortSignal).then((response) => ({
                index,
                response,
            }))
            inFlight.set(index, request)
        }

        while (nextToSchedule < windowSize) {
            scheduleByIndex(nextToSchedule)
            nextToSchedule += 1
        }

        while (inFlight.size > 0) {
            const settled = await Promise.race(inFlight.values())
            inFlight.delete(settled.index)
            completed.set(settled.index, settled.response)

            while (completed.has(nextToYield)) {
                const response = completed.get(nextToYield)
                completed.delete(nextToYield)
                nextToYield += 1
                if (response?.data && response.data.length > 0) {
                    yield response.data
                }
            }

            if (abortSignal?.aborted) return

            if (nextToSchedule < offsets.length) {
                scheduleByIndex(nextToSchedule)
                nextToSchedule += 1
            }
        }
    }
}
