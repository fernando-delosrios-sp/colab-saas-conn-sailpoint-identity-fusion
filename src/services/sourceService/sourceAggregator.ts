import { Search, SearchApiSearchPostRequest, SourcesV2025ApiImportAccountsRequest, TaskManagementV2025ApiGetTaskStatusRequest } from 'sailpoint-api-client'
import { assert } from '../../utils/assert'
import { getDateFromISOString } from '../../utils/date'
import { coerceBoolean } from '../../utils/safeRead'
import { ClientService, QueuePriority } from '../clientService'
import { promiseAllBatched } from '../fusionService/collections'
import { LogService } from '../logService'
import { SourceInfo } from './types'

export interface SourceAggregationTaskDeps {
    log: LogService
    client: ClientService
    sourcesById: Map<string, SourceInfo>
}

export interface SourceAggregatorDeps extends SourceAggregationTaskDeps {
    fusionSourceId: string
    managedSources: SourceInfo[]
    aggregationDateCache: Map<string, Promise<Date>>
}

/**
 * Get latest aggregation date for a source (only for managed sources)
 */
export async function getLatestAggregationDate(deps: SourceAggregatorDeps, sourceId: string): Promise<Date> {
    const { aggregationDateCache, sourcesById, client } = deps
    const cached = aggregationDateCache.get(sourceId)
    if (cached) {
        return cached
    }

    const fetchPromise = (async () => {
        const source = sourcesById.get(sourceId)
        assert(source, 'Source not found')
        const sourceName = source.name

        const search: Search = {
            indices: ['events'],
            query: {
                query: `operation:AGGREGATE AND status:PASSED AND objects:ACCOUNT AND target.name.exact:/${sourceName} \\[source.*\\]/`,
            },
            sort: ['-created'],
        }

        const requestParameters: SearchApiSearchPostRequest = { search, limit: 1 }
        const aggregations = await client.call(
            (api) => api.search.searchPost(requestParameters).then((r) => r.data ?? []),
            { priority: QueuePriority.HIGH, context: 'SourceService>getLatestAggregationDate' }
        )

        return getDateFromISOString(aggregations?.[0]?.created)
    })()

    aggregationDateCache.set(sourceId, fetchPromise)
    fetchPromise.catch(() => aggregationDateCache.delete(sourceId))

    return fetchPromise
}

/**
 * Aggregate managed sources configured with `aggregationMode: 'before'`.
 * Sources with `'delayed'` or `'none'` modes are skipped here.
 */
export async function aggregateManagedSources(deps: SourceAggregatorDeps): Promise<void> {
    const { log, managedSources } = deps
    log.debug(`Checking aggregation control for ${managedSources.length} managed source(s)`)

    const fusionLatestAggregationDate = await getLatestAggregationDate(deps, deps.fusionSourceId)

    // ⚡ Bolt: Use promiseAllBatched to cap concurrency (avoid unbounded Promise.all over large managedSources).
    // Impact: Prevents memory spikes and rate-limit triggers by batching API aggregation calls instead of running them all concurrently.
    const aggregationChecks = await promiseAllBatched(
        managedSources,
        async (source) => {
            const mode = source.config?.aggregationMode ?? 'none'

            if (mode !== 'before') {
                log.debug(`Source ${source.name}: aggregationMode=${mode}, skipping pre-processing aggregation`)
                return { source, shouldAggregate: false }
            }

            assert(source.isManaged, 'Only managed sources can be aggregated')
            const latestSourceDate = await getLatestAggregationDate(deps, source.id)
            const shouldAggregate = fusionLatestAggregationDate > latestSourceDate

            return { source, shouldAggregate }
        }
    )

    const disableOptimization = (source: SourceInfo) => coerceBoolean(source.config?.optimizedAggregation) === false

    // ⚡ Bolt: Bound concurrency to prevent triggering external API rate limits on massive source lists.
    // Impact: Reduces peak concurrency from O(N) to O(BatchSize).
    await promiseAllBatched(
        aggregationChecks.filter(({ shouldAggregate }) => shouldAggregate),
        async ({ source }) => {
            log.info(`Aggregating source before processing: ${source.name}`)
            return aggregateManagedSource(deps, source.id, disableOptimization(source))
        }
    )
    log.debug('Pre-processing source aggregation completed')
}

/**
 * Aggregate sources configured with `aggregationMode: 'delayed'`.
 * Each source is scheduled via the provided callback and runs out-of-band.
 */
export async function aggregateDelayedSources(
    deps: SourceAggregatorDeps,
    scheduleAggregation: (args: {
        sourceId: string
        delayMinutes: number
        disableOptimization: boolean
    }) => Promise<void>
): Promise<void> {
    const { log, managedSources } = deps
    assert(scheduleAggregation, 'Delayed aggregation scheduler is required')
    const delayedSources = managedSources.filter((s) => s.config?.aggregationMode === 'delayed')

    if (delayedSources.length === 0) {
        return
    }

    log.info(`Scheduling delayed aggregation for ${delayedSources.length} source(s)`)

    // ⚡ Bolt: Replace unbounded Promise.all with batched execution for delayed sources.
    // Impact: Avoids initiating all asynchronous scheduling requests simultaneously, ensuring predictable performance.
    await promiseAllBatched(
        delayedSources,
        async (source) => {
            const delayMinutes = source.config?.aggregationDelay ?? 5
            const disableOpt = coerceBoolean(source.config?.optimizedAggregation) === false

            log.info(
                `Source ${source.name}: scheduling delayed aggregation in ${delayMinutes} minute(s), disableOptimization=${disableOpt}`
            )

            try {
                await scheduleAggregation({
                    sourceId: source.id,
                    delayMinutes,
                    disableOptimization: disableOpt,
                })
            } catch (err) {
                log.error(
                    `Failed to schedule delayed aggregation for source ${source.name}: ${err instanceof Error ? err.message : String(err)
                    }`
                )
            }
        }
    )
}

/**
 * Aggregate managed source
 */
export async function aggregateManagedSource(
    deps: SourceAggregationTaskDeps,
    id: string,
    disableOptimization?: boolean,
    awaitTaskStatus: boolean = true
): Promise<void> {
    const { log, client, sourcesById } = deps
    let completed = false
    const sourceInfo = sourcesById.get(id)
    const sourceName = sourceInfo?.name ?? id
    const requestParameters: SourcesV2025ApiImportAccountsRequest = {
        id,
        disableOptimization: disableOptimization ? 'true' : undefined,
    }
    const loadAccountsTask = await client.call(
        (api) => api.sources.importAccounts(requestParameters).then((r) => r.data),
        { priority: QueuePriority.HIGH, context: 'SourceService>aggregateManagedSource executeImportAccounts' }
    )
    if (!loadAccountsTask) {
        log.warn(
            `Failed to trigger account aggregation for source ${sourceName} (${id}). The API call returned no data.`
        )
        return
    }

    if (!awaitTaskStatus) {
        const taskId = loadAccountsTask?.task?.id ?? 'unknown'
        log.info(
            `Triggered managed source aggregation for ${sourceName} (${id}) with taskId=${taskId} (status polling skipped)`
        )
        return
    }

    const timeoutMinutes = sourceInfo?.config?.aggregationTimeout ?? 10
    const pollIntervalMs = 30_000
    const deadlineMs = Date.now() + timeoutMinutes * 60_000
    const taskId = loadAccountsTask?.task?.id
    let pollsExecuted = 0
    let lastTaskStatus: any = undefined

    if (!taskId) {
        log.warn(`Aggregation task ID not found for source ${sourceName} (${id})`)
    }

    let firstPoll = true
    while (!completed && taskId && (firstPoll || Date.now() < deadlineMs)) {
        firstPoll = false
        const taskStatusRequestParameters: TaskManagementV2025ApiGetTaskStatusRequest = {
            id: taskId,
        }
        const taskStatus = await client.call(
            (api) => api.taskManagement.getTaskStatus(taskStatusRequestParameters).then((r) => r.data),
            { priority: QueuePriority.HIGH, context: 'SourceService>aggregateManagedSource executeGetTaskStatus' }
        )
        pollsExecuted++
        lastTaskStatus = taskStatus

        if (taskStatus?.completed) {
            completed = true
            break
        }
        const remainingMs = deadlineMs - Date.now()
        if (remainingMs <= 0) {
            break
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)))
    }
    if (!completed) {
        const lastStatusSummary = lastTaskStatus
            ? JSON.stringify({
                completed: lastTaskStatus.completed,
                completionStatus: lastTaskStatus.completionStatus,
                type: lastTaskStatus.type,
                description: lastTaskStatus.description,
                messages: lastTaskStatus.messages,
            })
            : 'none'
        log.warn(
            `Failed to aggregate managed accounts for source ${sourceName} (${id}). taskId=${taskId ?? 'unknown'}, timeoutMinutes=${timeoutMinutes}, pollIntervalMs=${pollIntervalMs}, pollsExecuted=${pollsExecuted}, lastTaskStatus=${lastStatusSummary}`
        )
    }
}
