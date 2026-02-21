import {
    Search,
    Account,
    AccountsApiListAccountsRequest,
    SearchApiSearchPostRequest,
    SourcesV2025ApiImportAccountsRequest,
    TaskManagementV2025ApiGetTaskStatusRequest,
    AccountsApiGetAccountRequest,
    Source,
    SourcesV2025ApiUpdateSourceRequest,
    SchemaV2025,
    SourcesV2025ApiGetSourceSchemasRequest,
    SourcesV2025ApiPutSourceSchemaRequest,
    SourcesV2025ApiGetCorrelationConfigRequest,
    SourcesV2025ApiPutCorrelationConfigRequest,
    IdentityProfilesV2025ApiListIdentityProfilesRequest,
    OwnerDto,
    SourcesV2025ApiListSourcesRequest,
    JsonPatchOperationV2025OpV2025,
    CorrelationConfigV2025,
    AttributeDefinitionV2025,
    AttributeDefinitionTypeV2025,
} from 'sailpoint-api-client'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { BaseConfig, FusionConfig, SourceConfig } from '../../model/config'
import { ClientService, QueuePriority } from '../clientService'
import { LogService } from '../logService'
import { assert, softAssert } from '../../utils/assert'
import { getDateFromISOString } from '../../utils/date'
import { SourceInfo } from './types'

// ============================================================================
// SourceService Class
// ============================================================================

/**
 * Service for managing sources, source discovery, and aggregation coordination.
 * Handles all source-related operations including finding the fusion source,
 * managing managed sources, and coordinating aggregations.
 */
export class SourceService {
    // Unified source storage - both managed and fusion sources
    private sourcesById: Map<string, SourceInfo> = new Map()
    private sourcesByName: Map<string, SourceInfo> = new Map()
    private fusionLatestAggregationDate: Date | undefined
    private sourceAggregationDates: Map<string, Date> = new Map()
    private _allSources?: SourceInfo[]
    private _fusionSourceId?: string
    private _fusionSourceOwner?: OwnerDto

    // Account caching and work queue
    // managedAccountsById serves dual purpose:
    // 1. Cache: Provides fast lookup of managed accounts by ID
    // 2. Work Queue: Gets depleted as accounts are processed (deleted) in order:
    //    fetchFormData → processFusionAccounts → processIdentities → processManagedAccounts
    public managedAccountsById: Map<string, Account> = new Map()
    // Secondary index: identityId → Set of account IDs for O(1) identity-based lookups
    // in addManagedAccountLayer. Kept in sync with managedAccountsById.
    public managedAccountsByIdentityId: Map<string, Set<string>> = new Map()
    public fusionAccountsByNativeIdentity?: Map<string, Account>

    /**
     * Clear managed accounts cache to free memory after processing.
     * 
     * Memory Optimization:
     * Called at the end of accountList operation after all accounts have been
     * sent to the platform. This releases potentially thousands of account objects
     * from memory. The work queue pattern means most accounts have already been
     * deleted during processing, but this ensures any remaining references are cleared.
     */
    public clearManagedAccounts(): void {
        this.managedAccountsById.clear()
        this.managedAccountsByIdentityId.clear()
        this.log.debug('Managed accounts cache cleared from memory')
    }

    /**
     * Clear fusion accounts cache to free memory after processing.
     * 
     * Memory Optimization:
     * Called at the end of accountList operation after all accounts have been
     * sent to the platform. Fusion accounts are loaded once and referenced throughout
     * processing, so clearing this cache at the end frees significant memory.
     */
    public clearFusionAccounts(): void {
        if (this.fusionAccountsByNativeIdentity) {
            this.fusionAccountsByNativeIdentity.clear()
        }
        this.log.debug('Fusion accounts cache cleared from memory')
    }

    // Config settings
    private readonly config: FusionConfig
    private readonly sources: SourceConfig[]
    private readonly spConnectorInstanceId: string
    private readonly taskResultRetries: number
    private readonly taskResultWait: number
    private readonly concurrencyCheckEnabled: boolean

    // Batch mode cumulative count per source (persisted across runs)
    private batchCumulativeCount: Record<string, number>

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /**
     * @param config - Fusion configuration containing source definitions and aggregation settings
     * @param log - Logger instance
     * @param client - API client for ISC source and account operations
     */
    constructor(
        config: FusionConfig,
        private log: LogService,
        private client: ClientService
    ) {
        this.config = config
        this.sources = config.sources
        this.spConnectorInstanceId = config.spConnectorInstanceId
        this.taskResultRetries = config.taskResultRetries
        this.taskResultWait = config.taskResultWait
        this.concurrencyCheckEnabled = config.concurrencyCheckEnabled

        // Read persisted batch cumulative count (may be undefined, false, or an object)
        const raw = config.batchCumulativeCount
        this.batchCumulativeCount = (raw && typeof raw === 'object' && !Array.isArray(raw))
            ? { ...raw }
            : {}
    }

    // ------------------------------------------------------------------------
    // Public Properties/Getters
    // ------------------------------------------------------------------------

    /**
     * Get fusion source ID
     */
    public get fusionSourceId(): string {
        assert(this._fusionSourceId, 'Fusion source not found')
        return this._fusionSourceId
    }

    /**
     * Get all managed sources
     */
    public get managedSources(): SourceInfo[] {
        assert(this._allSources, 'Sources have not been loaded')
        return this._allSources.filter((s) => s.id !== this.fusionSourceId)
    }

    /**
     * Get all sources (managed + fusion)
     */
    public get allSources(): SourceInfo[] {
        assert(this._allSources, 'Sources have not been loaded')
        return this._allSources
    }

    /**
     * Get all managed accounts as an array.
     * 
     * Work Queue Pattern:
     * This getter returns the current state of the work queue. As processing phases
     * complete (fetchFormData → processFusionAccounts → processIdentities), accounts
     * are deleted from managedAccountsById. By the time processManagedAccounts calls
     * this getter, it returns ONLY the uncorrelated accounts that remain in the queue.
     * 
     * This is intentional and critical for correct operation:
     * - No snapshot or copy is made
     * - Returns live view of the depleted queue
     * - Ensures no duplicate processing
     * 
     * Note: Creates a new array on each access. Use managedAccountCount for size checks.
     * 
     * @returns Array of accounts currently in the work queue
     */
    public get managedAccounts(): Account[] {
        assert(this.managedAccountsById, 'Managed accounts have not been loaded')
        return Array.from(this.managedAccountsById.values())
    }

    /**
     * Get the number of managed accounts in the work queue without creating an array.
     */
    public get managedAccountCount(): number {
        return this.managedAccountsById.size
    }

    /**
     * Get all fusion accounts as an array.
     * Note: Creates a new array on each access. Use fusionAccountCount for size checks.
     */
    public get fusionAccounts(): Account[] {
        assert(this.fusionAccountsByNativeIdentity, 'Fusion accounts have not been loaded')
        return Array.from(this.fusionAccountsByNativeIdentity.values())
    }

    /**
     * Get the number of fusion accounts without creating an array.
     */
    public get fusionAccountCount(): number {
        return this.fusionAccountsByNativeIdentity?.size ?? 0
    }

    // ------------------------------------------------------------------------
    // Public Source Fetch Methods
    // ------------------------------------------------------------------------

    /**
     * Fetch all sources (managed and fusion) and cache them
     */
    public async fetchAllSources(): Promise<void> {
        this.log.debug('Fetching all sources')
        const { sourcesApi } = this.client

        let apiSources: any[]
        try {
            const listSources = async (requestParameters?: SourcesV2025ApiListSourcesRequest) => {
                return await sourcesApi.listSources(requestParameters)
            }
            apiSources = await this.client.paginate(listSources, {}, QueuePriority.HIGH, 'SourceService>fetchAllSources listSources')
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(
                `Failed to fetch sources from ISC. Please verify your connector configuration and API credentials: ${detail}`,
                ConnectorErrorType.Generic
            )
        }
        assert(apiSources.length > 0, 'No sources found in ISC. Please verify that the configured sources exist and the connector has access to them.')

        // Build a Map for O(1) lookups instead of O(n) find() operations
        const apiSourcesByName = new Map(apiSources.map((s) => [s.name!, s]))

        // Build unified source info from SourceConfig + API IDs
        const resolvedSources: SourceInfo[] = []

        // Add managed sources (from config.sources)
        for (const sourceConfig of this.sources) {
            const apiSource = apiSourcesByName.get(sourceConfig.name)
            assert(apiSource, `Unable to find managed source "${sourceConfig.name}" in ISC. Please verify the source name is correct in the connector configuration.`)
            resolvedSources.push({
                id: apiSource.id!,
                name: apiSource.name!,
                isManaged: true,
                sourceType: sourceConfig.sourceType ?? 'identity',
                config: sourceConfig,
            })
        }

        // Find and add fusion source
        const fusionSource = apiSources.find(
            (x) => (x.connectorAttributes as BaseConfig).spConnectorInstanceId === this.spConnectorInstanceId
        )
        assert(fusionSource, 'Fusion source not found. The connector instance could not locate its own source in ISC. Verify the connector is properly deployed.')
        assert(fusionSource.owner, 'Fusion source owner not found. The fusion source must have an owner configured in ISC.')
        this._fusionSourceId = fusionSource.id!
        this._fusionSourceOwner = {
            id: fusionSource.owner.id!,
            type: 'IDENTITY',
        }

        resolvedSources.push({
            id: fusionSource.id!,
            name: fusionSource.name!,
            isManaged: false,
            sourceType: 'identity',
            config: undefined,
            owner: this._fusionSourceOwner,
        })

        this._allSources = resolvedSources
        this.sourcesById = new Map(resolvedSources.map((x) => [x.id, x]))
        this.sourcesByName = new Map(resolvedSources.map((x) => [x.name, x]))

        const managedCount = resolvedSources.filter((s) => s.isManaged).length
        this.log.debug(`Found ${managedCount} managed source(s) and fusion source: ${fusionSource.name}`)
    }

    // ------------------------------------------------------------------------
    // Public Source Lookup Methods
    // ------------------------------------------------------------------------

    /**
     * Get fusion source info
     */
    public getFusionSource(): SourceInfo | undefined {
        return Array.from(this.sourcesById.values()).find((s) => !s.isManaged)
    }

    /**
     * Get fusion source owner
     */
    public get fusionSourceOwner(): OwnerDto {
        assert(this._fusionSourceOwner, 'Fusion source owner not found')
        return this._fusionSourceOwner
    }

    /**
     * Get source info by ID
     */
    public getSourceById(id: string): SourceInfo | undefined {
        return this.sourcesById.get(id)
    }

    /**
     * Get source info by name
     */
    public getSourceByName(name: string): SourceInfo | undefined {
        return this.sourcesByName.get(name)
    }

    // ------------------------------------------------------------------------
    // Public Source Configuration Methods
    // ------------------------------------------------------------------------

    /**
     * Get source configuration by source name (only for managed sources)
     */
    public getSourceConfig(sourceName: string): SourceConfig | undefined {
        const sourceInfo = this.sourcesByName.get(sourceName)
        return sourceInfo?.config ?? this.sources.find((sc) => sc.name === sourceName)
    }

    /**
     * Get account filter for a source
     */
    public getAccountFilter(sourceName: string): string | undefined {
        return this.getSourceConfig(sourceName)?.accountFilter
    }

    /**
     * Fire-and-forget ISC API call to disable an account by its ID.
     * Uses low priority and does not await the result.
     */
    public fireDisableAccount(accountId: string): void {
        const { accountsApi } = this.client
        this.log.info(`Firing low-priority disable for account ${accountId}`)
        this.client.execute(
            () => accountsApi.disableAccount({
                id: accountId,
                accountToggleRequestV2025: { externalVerificationId: undefined, forceProvisioning: false },
            }),
            QueuePriority.LOW,
            'SourceService>fireDisableAccount'
        ).catch((err) => {
            this.log.warn(`Failed to disable account ${accountId}: ${err?.message ?? err}`)
        })
    }

    // ------------------------------------------------------------------------
    // Public Account Fetch Methods (Bulk)
    // ------------------------------------------------------------------------

    /**
     * Fetch all accounts for a given source ID, applying SourceConfig.accountFilter if present (for managed sources).
     */
    public async fetchAccountsBySourceId(sourceId: string, limit?: number): Promise<Account[]> {
        const { accountsApi } = this.client
        const sourceInfo = this.sourcesById.get(sourceId)
        assert(sourceInfo, `Source not found for id: ${sourceId}`)

        // Build filter using array join for better performance
        const filterParts: string[] = [`sourceId eq "${sourceId}"`]
        if (sourceInfo.isManaged && sourceInfo.config?.accountFilter) {
            filterParts.push(`(${sourceInfo.config.accountFilter})`)
        }
        const filters = filterParts.join(' and ')
        const sorters = 'created'

        const requestParameters: AccountsApiListAccountsRequest = {
            filters,
            limit,
            sorters,
        }

        const listAccounts = async (params: AccountsApiListAccountsRequest) => {
            return await accountsApi.listAccounts(params)
        }
        const ctx = `SourceService>fetchAccountsBySourceId ${sourceInfo.name}`
        return await this.client.paginate(listAccounts, requestParameters, QueuePriority.HIGH, ctx)
    }

    /**
     * Fetch accounts as an async generator using parallel pagination.
     * @param limit - When provided, only the pages needed to reach this count are requested.
     */
    public async *fetchAccountsBySourceIdGenerator(
        sourceId: string,
        abortSignal?: AbortSignal,
        limit?: number
    ): AsyncGenerator<Account[], void, unknown> {
        const { accountsApi } = this.client
        const sourceInfo = this.sourcesById.get(sourceId)
        assert(sourceInfo, `Source not found for id: ${sourceId}`)

        const filterParts: string[] = [`sourceId eq "${sourceId}"`]
        if (sourceInfo.isManaged && sourceInfo.config?.accountFilter) {
            filterParts.push(`(${sourceInfo.config.accountFilter})`)
        }
        const filters = filterParts.join(' and ')
        const sorters = 'created'

        const requestParameters: AccountsApiListAccountsRequest = {
            filters,
            sorters,
        }

        const listAccounts = async (params: AccountsApiListAccountsRequest) => {
            return await accountsApi.listAccounts(params)
        }
        const ctx = `SourceService>fetchAccountsBySourceIdGenerator ${sourceInfo.name}`

        yield* this.client.paginateParallel(listAccounts, requestParameters, QueuePriority.HIGH, ctx, abortSignal, limit)
    }


    /**
     * Fetch and cache fusion accounts
     */
    public async fetchFusionAccounts(): Promise<void> {
        this.log.debug('Fetching fusion accounts')
        try {
            const accounts = await this.fetchAccountsBySourceId(this.fusionSourceId)
            this.fusionAccountsByNativeIdentity = new Map(accounts.map((account) => [account.nativeIdentity!, account]))
            this.log.debug(`Fetched ${this.fusionAccountsByNativeIdentity.size} fusion account(s)`)
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(
                `Failed to fetch fusion accounts from the fusion source: ${detail}`,
                ConnectorErrorType.Generic
            )
        }
    }

    /**
     * Fetch and cache managed accounts from all managed sources.
     *
     * Batch Mode (cumulative):
     * When a source has an `accountLimit`, the effective limit grows across runs
     * so that previously fetched accounts are always included in subsequent runs.
     * The effective limit is `batchCumulativeCount[sourceName] + accountLimit`.
     * After fetching, the actual number of accounts retrieved is stored as the
     * new cumulative count for that source.
     */
    public async fetchManagedAccounts(abortSignal?: AbortSignal): Promise<void> {
        this.log.debug(`Fetching managed accounts from ${this.managedSources.length} source(s)`)

        // Compute effective limits per source
        const sourcesWithLimits = this.managedSources.map((s) => {
            const baseLimit = s.config?.accountLimit
            let effectiveLimit: number | undefined
            if (baseLimit) {
                const cumulativeCount = this.batchCumulativeCount[s.name] ?? 0
                effectiveLimit = cumulativeCount + baseLimit
                this.log.debug(
                    `Source ${s.name}: effectiveLimit=${effectiveLimit}`
                )
            }
            return { source: s, effectiveLimit }
        })

        try {
            // Fetch from all sources in parallel
            await Promise.all(
                sourcesWithLimits.map(async ({ source, effectiveLimit }) => {
                    this.log.info(`Fetching accounts from source: ${source.name}`)
                    let collectedCount = 0

                    for await (const batch of this.fetchAccountsBySourceIdGenerator(source.id, abortSignal, effectiveLimit)) {
                        for (const account of batch) {
                            if (effectiveLimit && collectedCount >= effectiveLimit) break
                            if (account.id) {
                                this.managedAccountsById.set(account.id, account)
                                if (account.identityId) {
                                    let idSet = this.managedAccountsByIdentityId.get(account.identityId)
                                    if (!idSet) {
                                        idSet = new Set()
                                        this.managedAccountsByIdentityId.set(account.identityId, idSet)
                                    }
                                    idSet.add(account.id)
                                }
                                collectedCount++
                            }
                        }
                        if (effectiveLimit && collectedCount >= effectiveLimit) {
                            this.log.info(`Source ${source.name}: reached effectiveLimit of ${effectiveLimit}, stopping`)
                            break
                        }
                    }

                    this.log.info(`Source ${source.name}: collected ${collectedCount} account(s)`)

                    if (source.config?.accountLimit !== undefined) {
                        this.batchCumulativeCount[source.name] = collectedCount
                        this.log.debug(
                            `Source ${source.name}: updated cumulative count to ${collectedCount}`
                        )
                    }
                })
            )
            this.log.debug(`Total managed accounts loaded: ${this.managedAccountsById.size}`)
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(
                `Failed to fetch managed accounts: ${detail}`,
                ConnectorErrorType.Generic
            )
        }
    }

    // ------------------------------------------------------------------------
    // Public Account Fetch Methods (Single)
    // ------------------------------------------------------------------------

    /**
     * Fetch and cache a single fusion account by nativeIdentity
     */
    public async fetchFusionAccount(nativeIdentity: string, mustExist = true): Promise<void> {
        this.log.debug('Fetching fusion account')
        const fusionAccount = await this.fetchSourceAccountByNativeIdentity(this.fusionSourceId, nativeIdentity)

        if (!fusionAccount) {
            if (mustExist) {
                throw new ConnectorError(
                    `Fusion account not found for native identity "${nativeIdentity}". The account may have been deleted or the identity does not exist.`,
                    ConnectorErrorType.Generic
                )
            }
            return
        }

        if (!this.fusionAccountsByNativeIdentity) {
            this.fusionAccountsByNativeIdentity = new Map()
        }
        this.fusionAccountsByNativeIdentity.set(fusionAccount.nativeIdentity!, fusionAccount)
        this.log.debug(`Fetched fusion account: ${fusionAccount.name}`)
    }

    /**
     * Fetch and cache a single managed account by ID
     */
    public async fetchManagedAccount(id: string): Promise<void> {
        const managedAccount = await this.fetchAccountById(id)
        if (!managedAccount) {
            this.log.warn(`Managed account not found for id: ${id}`)
            return
        }

        this.managedAccountsById.set(managedAccount.id!, managedAccount)
        if (managedAccount.identityId) {
            let idSet = this.managedAccountsByIdentityId.get(managedAccount.identityId)
            if (!idSet) {
                idSet = new Set()
                this.managedAccountsByIdentityId.set(managedAccount.identityId, idSet)
            }
            idSet.add(managedAccount.id!)
        }
    }

    /**
     * Fetch a single account for a given source ID and nativeIdentity, applying SourceConfig.accountFilter if present (for managed sources).
     */
    public async fetchSourceAccountByNativeIdentity(
        sourceId: string,
        nativeIdentity: string
    ): Promise<Account | undefined> {
        const { accountsApi } = this.client
        const sourceInfo = this.sourcesById.get(sourceId)
        assert(sourceInfo, `Source not found for id: ${sourceId}`)

        // Build filter using array join for better performance
        const filterParts: string[] = [
            `sourceId eq "${sourceId}"`,
            `nativeIdentity eq "${nativeIdentity}"`
        ]
        if (sourceInfo.isManaged && sourceInfo.config?.accountFilter) {
            filterParts.push(`(${sourceInfo.config.accountFilter})`)
        }
        const filters = filterParts.join(' and ')

        const requestParameters: AccountsApiListAccountsRequest = {
            filters,
        }

        const listAccounts = async () => {
            const response = await accountsApi.listAccounts(requestParameters)
            return response.data ?? []
        }

        const accounts = await this.client.execute(listAccounts, QueuePriority.HIGH, 'SourceService>fetchSourceAccountByNativeIdentity')
        return accounts?.[0]
    }

    // ------------------------------------------------------------------------
    // Public Aggregation Methods
    // ------------------------------------------------------------------------

    /**
     * Aggregate managed sources configured with `aggregationMode: 'before'`.
     * Sources with `'delayed'` or `'none'` modes are skipped here.
     */
    public async aggregateManagedSources(): Promise<void> {
        const managedSources = this.managedSources
        this.log.debug(`Checking aggregation control for ${managedSources.length} managed source(s)`)

        const aggregationChecks = await Promise.all(
            managedSources.map(async (source) => {
                const mode = source.config?.aggregationMode ?? 'none'

                if (mode !== 'before') {
                    this.log.debug(`Source ${source.name}: aggregationMode=${mode}, skipping pre-processing aggregation`)
                    return { source, shouldAggregate: false }
                }

                const shouldAggregate = await this.shouldAggregateSource(source)
                return { source, shouldAggregate }
            })
        )

        const disableOptimization = (source: SourceInfo) =>
            source.config?.optimizedAggregation === false

        await Promise.all(
            aggregationChecks
                .filter(({ shouldAggregate }) => shouldAggregate)
                .map(async ({ source }) => {
                    this.log.info(`Aggregating source before processing: ${source.name}`)
                    await this.aggregateManagedSource(source.id, disableOptimization(source))
                })
        )
        this.log.debug('Pre-processing source aggregation completed')
    }

    /**
     * Fire-and-forget aggregation for sources configured with `aggregationMode: 'delayed'`.
     * Each source waits its configured `aggregationDelay` (minutes) before triggering.
     * This method is intentionally NOT awaited by the caller.
     */
    public aggregateDelayedSources(): void {
        const delayedSources = this.managedSources.filter(
            (s) => s.config?.aggregationMode === 'delayed'
        )

        if (delayedSources.length === 0) {
            return
        }

        this.log.info(`Scheduling delayed aggregation for ${delayedSources.length} source(s)`)

        for (const source of delayedSources) {
            const delayMinutes = source.config?.aggregationDelay ?? 5
            const delayMs = delayMinutes * 60 * 1000
            const disableOpt = source.config?.optimizedAggregation === false

            this.log.info(`Source ${source.name}: delayed aggregation in ${delayMinutes} minute(s)`)

            setTimeout(() => {
                this.log.info(`Triggering delayed aggregation for source: ${source.name}`)
                this.aggregateManagedSource(source.id, disableOpt).catch((err) => {
                    this.log.error(
                        `Delayed aggregation failed for source ${source.name}: ${err instanceof Error ? err.message : String(err)}`
                    )
                })
            }, delayMs)
        }
    }

    /**
     * Get latest aggregation date for a source (only for managed sources)
     */
    public async getLatestAggregationDate(sourceId: string): Promise<Date> {
        const source = this.sourcesById.get(sourceId)
        assert(source, 'Source not found')
        const sourceName = source.name

        const { searchApi } = this.client
        const search: Search = {
            indices: ['events'],
            query: {
                query: `operation:AGGREGATE AND status:PASSED AND objects:ACCOUNT AND target.name.exact:"${sourceName} [source]"`,
            },
            sort: ['-created'],
        }

        const requestParameters: SearchApiSearchPostRequest = { search, limit: 1 }
        const searchPost = async () => {
            const response = await searchApi.searchPost(requestParameters)
            return response.data ?? []
        }
        const aggregations = await this.client.execute(searchPost, QueuePriority.HIGH, 'SourceService>getLatestAggregationDate')

        const latestAggregation = getDateFromISOString(aggregations?.[0]?.created)

        return latestAggregation
    }

    // ------------------------------------------------------------------------
    // Public Schema Methods
    // ------------------------------------------------------------------------

    /**
     * List schemas for a source
     */
    public async listSourceSchemas(sourceId: string): Promise<SchemaV2025[]> {
        const { sourcesApi } = this.client
        const requestParameters: SourcesV2025ApiGetSourceSchemasRequest = {
            sourceId,
        }
        const getSourceSchemas = async () => {
            const response = await sourcesApi.getSourceSchemas(requestParameters)
            return response.data ?? []
        }
        const schemas = await this.client.execute(getSourceSchemas, QueuePriority.HIGH, 'SourceService>listSourceSchemas')
        if (!schemas) {
            throw new ConnectorError(
                `Failed to fetch schemas for source "${sourceId}". The API call returned no data.`,
                ConnectorErrorType.Generic
            )
        }
        return schemas
    }

    // ------------------------------------------------------------------------
    // Public Configuration Methods
    // ------------------------------------------------------------------------

    /**
     * Update source configuration
     * @param context - Optional hint for error logs (e.g. "SourceService>saveBatchCumulativeCount")
     */
    public async patchSourceConfig(
        _id: string,
        requestParameters: SourcesV2025ApiUpdateSourceRequest,
        context?: string
    ): Promise<Source | undefined> {
        const { sourcesApi } = this.client
        const updateSource = async () => {
            const response = await sourcesApi.updateSource(requestParameters)
            return response.data
        }
        const ctx = context ?? 'SourceService>patchSourceConfig'
        return await this.client.execute(updateSource, QueuePriority.HIGH, ctx)
    }

    // ------------------------------------------------------------------------
    // Public Process Lock Methods
    // ------------------------------------------------------------------------

    /**
     * Set the processing lock on the fusion source to prevent concurrent aggregations.
     *
     * Gated by the `concurrencyCheckEnabled` developer setting.
     * When the setting is disabled, this method is a no-op.
     *
     * When enabled (default), this method sets a `processing` flag on the fusion
     * source's connector attributes. If another aggregation is already in progress
     * (the flag is already `true`), it **resets the flag** back to `false` and throws
     * a `ConnectorError`, asking the user to verify there is no ongoing aggregation
     * before retrying. This self-healing approach means a stuck flag from a prior
     * crash is automatically cleared on the next attempt, so the subsequent retry
     * will succeed.
     *
     * @throws {ConnectorError} if the processing flag is already active
     */
    public async setProcessLock(): Promise<void> {
        if (!this.concurrencyCheckEnabled) {
            this.log.debug('Concurrency check is disabled, skipping processing lock.')
            return
        }

        const fusionSourceId = this.fusionSourceId

        const { sourcesApi } = this.client
        const getSource = async () => {
            const response = await sourcesApi.getSource({ id: fusionSourceId })
            return response.data
        }
        const source = await this.client.execute(getSource, QueuePriority.HIGH, 'SourceService>setProcessLock')
        assert(source, 'Failed to fetch fusion source to check processing lock. The API call returned no data.')

        const processing = (source!.connectorAttributes as any)?.processing
        if (processing === 'true' || processing === true) {
            this.log.warn('Processing flag is active. Aborting this run.')
            // Reset the flag so the next attempt can proceed
            // await this.releaseProcessLock()
            throw new ConnectorError(
                'An account aggregation is already in progress or the previous one did not finish cleanly. ' +
                'Please verify no other aggregation is running and try again.',
                ConnectorErrorType.Generic
            )
        }

        this.log.info('Setting processing lock to true.')
        const requestParameters: SourcesV2025ApiUpdateSourceRequest = {
            id: fusionSourceId,
            jsonPatchOperationV2025: [
                {
                    op: 'add' as JsonPatchOperationV2025OpV2025,
                    path: '/connectorAttributes/processing',
                    value: true,
                },
            ],
        }
        await this.patchSourceConfig(fusionSourceId, requestParameters, 'SourceService>setProcessLock')
    }

    /**
     * Release the processing lock on the fusion source.
     *
     * Gated by the `concurrencyCheckEnabled` developer setting.
     * When the setting is disabled, this method is a no-op.
     *
     * Called in `finally` blocks to ensure the lock is always released after an aggregation
     * completes (whether successfully or with an error). Errors during release are logged
     * but not re-thrown, since this runs during cleanup.
     */
    public async releaseProcessLock(): Promise<void> {
        if (!this.concurrencyCheckEnabled) {
            return
        }

        try {
            const fusionSourceId = this.fusionSourceId
            this.log.info('Releasing processing lock.')
            const requestParameters: SourcesV2025ApiUpdateSourceRequest = {
                id: fusionSourceId,
                jsonPatchOperationV2025: [
                    {
                        op: 'add' as JsonPatchOperationV2025OpV2025,
                        path: '/connectorAttributes/processing',
                        value: false,
                    },
                ],
            }
            await this.patchSourceConfig(fusionSourceId, requestParameters, 'SourceService>releaseProcessLock')
        } catch (error) {
            this.log.error(`Failed to release processing lock: ${error instanceof Error ? error.message : String(error)}`)
            // Don't throw here as this is typically called in cleanup
        }
    }

    // ------------------------------------------------------------------------
    // Public Batch Cumulative Count Methods
    // ------------------------------------------------------------------------

    /**
     * Persist the current batch cumulative count to the fusion source configuration.
     *
     * Called at the end of a successful account list operation so that the next run
     * knows how many accounts were previously fetched per source. Only writes to the
     * API when at least one source has an `accountLimit` (i.e. batch mode is active).
     */
    public async saveBatchCumulativeCount(): Promise<void> {
        if (Object.keys(this.batchCumulativeCount).length === 0) {
            return
        }

        const fusionSourceId = this.fusionSourceId
        this.log.info(`Saving batch cumulative count: ${JSON.stringify(this.batchCumulativeCount)}`)
        const requestParameters: SourcesV2025ApiUpdateSourceRequest = {
            id: fusionSourceId,
            jsonPatchOperationV2025: [
                {
                    op: 'add' as JsonPatchOperationV2025OpV2025,
                    path: '/connectorAttributes/batchCumulativeCount',
                    value: this.batchCumulativeCount,
                },
            ],
        }
        await this.patchSourceConfig(fusionSourceId, requestParameters, 'SourceService>saveBatchCumulativeCount')
    }

    /**
     * Clear the persisted batch cumulative count from the fusion source configuration.
     *
     * Called during a reset operation so that the next run starts fresh with no
     * cumulative offset, effectively re-fetching only the base `accountLimit`
     * number of accounts per source. No-op when batch mode was never active
     * (no persisted cumulative counts exist).
     */
    public async resetBatchCumulativeCount(): Promise<void> {
        if (Object.keys(this.batchCumulativeCount).length === 0) {
            return
        }

        this.batchCumulativeCount = {}
        const fusionSourceId = this.fusionSourceId
        this.log.info('Resetting batch cumulative count')
        const requestParameters: SourcesV2025ApiUpdateSourceRequest = {
            id: fusionSourceId,
            jsonPatchOperationV2025: [
                {
                    op: 'add' as JsonPatchOperationV2025OpV2025,
                    path: '/connectorAttributes/batchCumulativeCount',
                    value: {},
                },
            ],
        }
        await this.patchSourceConfig(fusionSourceId, requestParameters, 'SourceService>resetBatchCumulativeCount')
    }

    // ------------------------------------------------------------------------
    // Public Reverse Correlation Setup Methods
    // ------------------------------------------------------------------------

    /**
     * Validate that a reverse correlation attribute name does not overlap with
     * existing attribute mappings, normal/unique definitions, or source schema attributes.
     */
    public validateNoAttributeOverlap(attributeName: string, schemaAttributeNames: Set<string>): void {
        const lowerName = attributeName.toLowerCase()

        for (const attrMap of this.config.attributeMaps ?? []) {
            if (attrMap.newAttribute.toLowerCase() === lowerName) {
                throw new ConnectorError(
                    `Reverse correlation attribute "${attributeName}" conflicts with attribute mapping "${attrMap.newAttribute}".`,
                    ConnectorErrorType.Generic
                )
            }
        }

        for (const def of this.config.normalAttributeDefinitions ?? []) {
            if (def.name.toLowerCase() === lowerName) {
                throw new ConnectorError(
                    `Reverse correlation attribute "${attributeName}" conflicts with normal attribute definition "${def.name}".`,
                    ConnectorErrorType.Generic
                )
            }
        }

        for (const def of this.config.uniqueAttributeDefinitions ?? []) {
            if (def.name.toLowerCase() === lowerName) {
                throw new ConnectorError(
                    `Reverse correlation attribute "${attributeName}" conflicts with unique attribute definition "${def.name}".`,
                    ConnectorErrorType.Generic
                )
            }
        }

        if (schemaAttributeNames.has(lowerName)) {
            throw new ConnectorError(
                `Reverse correlation attribute "${attributeName}" conflicts with an existing source account schema attribute.`,
                ConnectorErrorType.Generic
            )
        }
    }

    /**
     * Ensure all ISC entities for reverse correlation are properly configured.
     * Called once per source with `correlationMode === 'reverse'` during aggregation setup.
     */
    public async ensureReverseCorrelationSetup(
        sourceConfig: SourceConfig,
        schemaAttributeNames: Set<string>
    ): Promise<void> {
        const { correlationAttribute, correlationDisplayName, name: sourceName } = sourceConfig
        assert(correlationAttribute, `Reverse correlation attribute name is required for source "${sourceName}"`)
        assert(correlationDisplayName, `Reverse correlation display name is required for source "${sourceName}"`)

        this.validateNoAttributeOverlap(correlationAttribute, schemaAttributeNames)

        const sourceInfo = this.sourcesByName.get(sourceName)
        assert(sourceInfo, `Source "${sourceName}" not found`)

        this.log.info(`Setting up reverse correlation for source "${sourceName}": attribute="${correlationAttribute}", displayName="${correlationDisplayName}"`)

        await this.ensureFusionSchemaAttribute(correlationAttribute, correlationDisplayName)
        await this.ensureIdentityAttribute(correlationAttribute, correlationDisplayName)
        await this.ensureIdentityProfileMapping(correlationAttribute)
        await this.ensureManagedSourceCorrelation(correlationAttribute, sourceInfo.id)
    }

    /**
     * Ensure the dedicated reverse correlation attribute exists in the Fusion source's account schema.
     */
    private async ensureFusionSchemaAttribute(attributeName: string, displayName: string): Promise<void> {
        const fusionSourceId = this.fusionSourceId
        const schemas = await this.listSourceSchemas(fusionSourceId)
        const accountSchema = schemas.find((s) => s.name === 'account')
        assert(accountSchema, 'Fusion source account schema not found')

        const existingAttr = accountSchema.attributes?.find(
            (a) => a.name?.toLowerCase() === attributeName.toLowerCase()
        )
        if (existingAttr) {
            this.log.debug(`Fusion schema attribute "${attributeName}" already exists`)
            return
        }

        const newAttr: AttributeDefinitionV2025 = {
            name: attributeName,
            description: displayName,
            type: AttributeDefinitionTypeV2025.String,
            isMulti: false,
            isEntitlement: false,
            isGroup: false,
        }

        const updatedAttributes: AttributeDefinitionV2025[] = [
            ...(accountSchema.attributes ?? []),
            newAttr,
        ]

        const updatedSchema: SchemaV2025 = {
            ...accountSchema,
            attributes: updatedAttributes,
        }

        const requestParameters: SourcesV2025ApiPutSourceSchemaRequest = {
            sourceId: fusionSourceId,
            schemaId: accountSchema.id!,
            schemaV2025: updatedSchema,
        }

        const { sourcesApi } = this.client
        await this.client.execute(
            () => sourcesApi.putSourceSchema(requestParameters).then((r) => r.data),
            QueuePriority.HIGH,
            `SourceService>ensureFusionSchemaAttribute ${attributeName}`
        )

        this.log.info(`Added reverse correlation attribute "${attributeName}" to Fusion source schema`)
    }

    /**
     * Ensure the ISC identity attribute exists and is searchable.
     */
    private async ensureIdentityAttribute(attributeName: string, displayName: string): Promise<void> {
        const { identityAttributesApi } = this.client

        const existing = await this.client.execute(
            () => identityAttributesApi.getIdentityAttribute({ name: attributeName }).then((r) => r.data),
            QueuePriority.HIGH,
            `SourceService>ensureIdentityAttribute get ${attributeName}`
        )

        if (existing) {
            if (existing.searchable) {
                this.log.debug(`Identity attribute "${attributeName}" already exists and is searchable`)
                return
            }
            await this.client.execute(
                () => identityAttributesApi.putIdentityAttribute({
                    name: attributeName,
                    identityAttributeV2025: {
                        name: attributeName,
                        displayName,
                        searchable: true,
                        type: 'string',
                        multi: false,
                        standard: false,
                        system: false,
                    },
                }).then((r) => r.data),
                QueuePriority.HIGH,
                `SourceService>ensureIdentityAttribute update ${attributeName}`
            )
            this.log.info(`Updated identity attribute "${attributeName}" to be searchable`)
            return
        }

        await this.client.execute(
            () => identityAttributesApi.createIdentityAttribute({
                identityAttributeV2025: {
                    name: attributeName,
                    displayName,
                    searchable: true,
                    type: 'string',
                    multi: false,
                    standard: false,
                    system: false,
                },
            }).then((r) => r.data),
            QueuePriority.HIGH,
            `SourceService>ensureIdentityAttribute create ${attributeName}`
        )
        this.log.info(`Created searchable identity attribute "${attributeName}"`)
    }

    /**
     * Ensure the Identity Fusion NG source's identity profile has a mapping from the
     * Fusion account attribute to the identity attribute.
     */
    private async ensureIdentityProfileMapping(attributeName: string): Promise<void> {
        const fusionSourceId = this.fusionSourceId
        const { identityProfilesApi } = this.client

        const allProfiles = await this.client.paginate(
            (params: IdentityProfilesV2025ApiListIdentityProfilesRequest) =>
                identityProfilesApi.listIdentityProfiles(params),
            {},
            QueuePriority.HIGH,
            'SourceService>ensureIdentityProfileMapping listProfiles'
        )

        const profile = allProfiles.find(
            (p: any) => p.authoritativeSource?.id === fusionSourceId
        )

        assert(
            profile,
            `No identity profile found for the Identity Fusion NG source. An identity profile with the Identity Fusion NG source as authoritative source is required for reverse correlation.`
        )
        const transforms = profile.identityAttributeConfig?.attributeTransforms ?? []

        const alreadyMapped = transforms.some(
            (t) => t.identityAttributeName === attributeName
        )
        if (alreadyMapped) {
            this.log.debug(`Identity profile already maps attribute "${attributeName}"`)
            return
        }

        const fusionSource = this.getFusionSource()
        assert(fusionSource, 'Fusion source not found')

        const newTransform = {
            identityAttributeName: attributeName,
            transformDefinition: {
                type: 'accountAttribute',
                attributes: {
                    sourceName: fusionSource.name,
                    attributeName,
                },
            },
        }

        const patchIndex = transforms.length

        await this.client.execute(
            () => identityProfilesApi.updateIdentityProfile({
                identityProfileId: profile.id!,
                jsonPatchOperationV2025: [
                    {
                        op: 'add' as JsonPatchOperationV2025OpV2025,
                        path: `/identityAttributeConfig/attributeTransforms/${patchIndex}`,
                        value: newTransform,
                    },
                ],
            }).then((r) => r.data),
            QueuePriority.HIGH,
            `SourceService>ensureIdentityProfileMapping add ${attributeName}`
        )
        this.log.info(`Added identity profile mapping for attribute "${attributeName}"`)
    }

    /**
     * Ensure the managed source's correlation config includes an accountName-to-identity-attribute rule.
     */
    private async ensureManagedSourceCorrelation(attributeName: string, managedSourceId: string): Promise<void> {
        const { sourcesApi } = this.client

        const correlationConfig = await this.client.execute(
            () => sourcesApi.getCorrelationConfig({
                id: managedSourceId,
            } as SourcesV2025ApiGetCorrelationConfigRequest).then((r) => r.data),
            QueuePriority.HIGH,
            `SourceService>ensureManagedSourceCorrelation get ${managedSourceId}`
        )

        const assignments = correlationConfig?.attributeAssignments ?? []
        const alreadyExists = assignments.some(
            (a) => a.property === 'accountName' && a.value === attributeName
        )
        if (alreadyExists) {
            this.log.debug(`Managed source ${managedSourceId} already has correlation rule for "${attributeName}"`)
            return
        }

        const updatedConfig: CorrelationConfigV2025 = {
            ...correlationConfig,
            attributeAssignments: [
                ...assignments,
                {
                    property: 'accountName',
                    value: attributeName,
                    operation: 'EQ' as any,
                    complex: false,
                    ignoreCase: false,
                    matchMode: undefined,
                    filterString: undefined,
                },
            ],
        }

        await this.client.execute(
            () => sourcesApi.putCorrelationConfig({
                id: managedSourceId,
                correlationConfigV2025: updatedConfig,
            } as SourcesV2025ApiPutCorrelationConfigRequest).then((r) => r.data),
            QueuePriority.HIGH,
            `SourceService>ensureManagedSourceCorrelation put ${managedSourceId}`
        )
        this.log.info(`Added correlation rule accountName="${attributeName}" to managed source ${managedSourceId}`)
    }

    // ------------------------------------------------------------------------
    // Private Helper Methods
    // ------------------------------------------------------------------------

    /**
     * Fetch a single account by ID
     */
    private async fetchAccountById(id: string): Promise<Account | undefined> {
        const { accountsApi } = this.client
        const requestParameters: AccountsApiGetAccountRequest = {
            id,
        }
        const getAccount = async () => {
            const response = await accountsApi.getAccount(requestParameters)
            return response.data ?? undefined
        }
        const account = await this.client.execute(getAccount, QueuePriority.HIGH, 'SourceService>fetchAccountById')
        return account
    }

    /**
     * Check if a managed source should be aggregated based on fusion aggregation date
     */
    private async shouldAggregateSource(source: SourceInfo): Promise<boolean> {
        assert(source.isManaged, 'Only managed sources can be aggregated')
        if (!this.fusionLatestAggregationDate) {
            this.fusionLatestAggregationDate = await this.getLatestAggregationDate(this.fusionSourceId)
        }

        // Cache aggregation dates to avoid redundant API calls
        let latestSourceDate = this.sourceAggregationDates.get(source.id)
        if (!latestSourceDate) {
            latestSourceDate = await this.getLatestAggregationDate(source.id)
            this.sourceAggregationDates.set(source.id, latestSourceDate)
        }

        return this.fusionLatestAggregationDate! > latestSourceDate
    }

    /**
     * Aggregate managed source
     */
    private async aggregateManagedSource(id: string, disableOptimization?: boolean): Promise<void> {
        let completed = false
        const { sourcesApi, taskManagementApi } = this.client
        const requestParameters: SourcesV2025ApiImportAccountsRequest = {
            id,
            disableOptimization: disableOptimization ? 'true' : undefined,
        }
        const importAccounts = async () => {
            const response = await sourcesApi.importAccounts(requestParameters)
            return response.data
        }
        const loadAccountsTask = await this.client.execute(importAccounts, QueuePriority.HIGH, 'SourceService>aggregateManagedSource importAccounts')
        if (!loadAccountsTask) {
            this.log.warn(`Failed to trigger account aggregation for source ${id}. The API call returned no data.`)
            return
        }

        // Use global retry settings for aggregation task polling
        const taskResultRetries = this.taskResultRetries
        const taskResultWait = this.taskResultWait

        let count = taskResultRetries
        while (--count > 0) {
            const id = loadAccountsTask?.task?.id
            if (!id) {
                this.log.warn('Aggregation task ID not found')
                break
            }
            const requestParameters: TaskManagementV2025ApiGetTaskStatusRequest = {
                id,
            }
            const getTaskStatus = async () => {
                const response = await taskManagementApi.getTaskStatus(requestParameters)
                return response.data
            }
            const taskStatus = await this.client.execute(getTaskStatus, QueuePriority.HIGH, 'SourceService>aggregateManagedSource getTaskStatus')

            if (taskStatus?.completed) {
                completed = true
                break
            } else {
                await new Promise((resolve) => setTimeout(resolve, taskResultWait))
            }
        }
        softAssert(completed, 'Failed to aggregate managed accounts')
    }
}
