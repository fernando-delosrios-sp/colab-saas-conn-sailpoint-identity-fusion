import { AccountsApiUpdateAccountRequest, IdentityDocument, Search } from 'sailpoint-api-client'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionConfig } from '../model/config'
import { ClientService, QueuePriority } from './clientService'
import { promiseAllBatched } from './fusionService/collections'
import { LogService } from './logService'
import { wrapConnectorError } from '../utils/error'
import { FusionAccount } from '../model/account'
import { SourceService } from './sourceService'
import { FusionRun } from '../model/fusionRun'

// ============================================================================
// Constants
// ============================================================================

const IDENTITY_SEARCH_INCLUDES = [
    'id',
    'name',
    'displayName',
    'email',
    'attributes',
    'accounts',
    'disabled',
    'protected',
]

function buildIdentityQuery(queryString: string): Search {
    return {
        indices: ['identities'],
        query: { query: queryString },
        queryResultFilter: { includes: IDENTITY_SEARCH_INCLUDES },
        includeNested: true,
    }
}

// ============================================================================
// IdentityService Class
// ============================================================================

/**
 * Service for managing identity documents, identity lookups, and reviewer management.
 */
export class IdentityService {
    /** Identity IDs loaded by the last `fetchIdentities()` call, which respects `includeIdentities` and `identityScopeQuery`. */
    private identityIdsInScope: Set<string> = new Set()
    private readonly identityScopeQuery?: string
    private readonly includeIdentities: boolean

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /**
     * @param config - Fusion configuration containing identity scope settings
     * @param log - Logger instance
     * @param client - API client for ISC search and account operations
     */
    constructor(
        config: FusionConfig,
        private log: LogService,
        private client: ClientService,
        private sources: SourceService,
        private run: FusionRun
    ) {
        this.identityScopeQuery = config.identityScopeQuery
        this.includeIdentities = config.includeIdentities ?? true
    }

    // ------------------------------------------------------------------------
    // Public Properties/Getters
    // ------------------------------------------------------------------------

    /**
     * Get all identities as an array.
     * Note: Creates a new array on each access. Use identityCount for size checks
     * and identityValues() for iteration when no array is needed.
     */
    public get identities(): IdentityDocument[] {
        return this.run.allIdentities
    }

    /**
     * Get the number of cached identities without creating an intermediate array.
     */
    public get identityCount(): number {
        return this.run.identityCount
    }

    /**
     * Returns an iterator over cached identity documents.
     * Avoids creating a temporary array when only iteration is needed.
     */
    public identityValues(): IterableIterator<IdentityDocument> {
        return this.run.identityValues()
    }

    // ------------------------------------------------------------------------
    // Public Fetch Methods
    // ------------------------------------------------------------------------

    /**
     * Fetch identities and cache them
     */
    public async fetchIdentities(additionalIdentityIds?: string[]): Promise<void> {
        if (!this.includeIdentities && !additionalIdentityIds?.length) {
            this.log.info('Skipping identity fetch.')
            return
        }

        if (this.includeIdentities && this.identityScopeQuery) {
            this.log.info('Fetching identities.')

            const query = buildIdentityQuery(this.identityScopeQuery)

            await wrapConnectorError(async () => {
                const identities = await this.client.call<IdentityDocument>(
                    (api: any, params: any) => api.search.searchPost(params).then((r: any) => r.data as IdentityDocument[]),
                    {
                        paginate: { mode: 'searchAfter', search: query as any },
                        priority: QueuePriority.HIGH,
                        context: 'IdentityService>fetchIdentities searchPost',
                        onPageProgress: (loaded, total) =>
                            this.log.setProgress(loaded, total ?? loaded, 'fetched'),
                    }
                )
                this.run.clearIdentities()
                for (const identity of identities) {
                    if (!identity.protected) {
                        this.run.addIdentity(identity.id, identity)
                    }
                }
                this.identityIdsInScope = new Set(
                    identities.filter((identity) => !identity.protected).map((identity) => identity.id)
                )
            }, `Failed to fetch identities using scope query "${this.identityScopeQuery}"`)
        } else if (this.includeIdentities) {
            this.log.info('No identity scope query defined, skipping global identity fetch.')
            this.run.clearIdentities()
            this.identityIdsInScope = new Set()
        }

        if (additionalIdentityIds?.length) {
            await this.hydrateMissingIdentitiesById(additionalIdentityIds)
            for (const id of additionalIdentityIds) {
                if (!id) continue
                const identity = this.run.getIdentity(id)
                if (identity && !identity.protected) {
                    this.identityIdsInScope.add(id)
                }
            }
        }
    }

    /**
     * Fetch identities as an async generator using search pagination.
     */
    public async *fetchIdentitiesGenerator(abortSignal?: AbortSignal): AsyncGenerator<IdentityDocument[]> {
        if (!this.includeIdentities) {
            this.log.info('Identity fetching disabled by configuration, skipping identity fetch.')
            return
        }

        if (this.identityScopeQuery) {
            this.log.info('Fetching identities (streaming).')

            const query = buildIdentityQuery(this.identityScopeQuery)

            try {
                yield* this.client.paginateSearchApiGenerator<IdentityDocument>(
                    query,
                    QueuePriority.HIGH,
                    'IdentityService>fetchIdentitiesGenerator searchPost',
                    abortSignal
                )
            } catch (error) {
                if (error instanceof ConnectorError) throw error
                const detail = error instanceof Error ? error.message : String(error)
                throw new ConnectorError(
                    `Failed to fetch identities using scope query "${this.identityScopeQuery}": ${detail}`,
                    ConnectorErrorType.Generic
                )
            }
        } else {
            this.log.info('No identity scope query defined, skipping identity fetch.')
        }
    }

    /**
     * Fetches a single identity by ID and adds it to the cache.
     *
     * @param id - The ISC identity ID to fetch
     * @returns The fetched identity document
     */
    public async fetchIdentityById(id: string): Promise<IdentityDocument> {
        this.log.debug(`Fetching identity ${id}.`)

        const query = buildIdentityQuery(`id:"${id}"`)

        return wrapConnectorError(async () => {
            const identities = await this.client.call<IdentityDocument>(
                (api: any, params: any) => api.search.searchPost(params).then((r: any) => r.data as IdentityDocument[]),
                { paginate: { mode: 'searchAfter', search: query as any }, priority: QueuePriority.HIGH, context: 'IdentityService>fetchIdentityById searchPost' }
            )
            identities.forEach((identity) => this.run.addIdentity(identity.id, identity))
            return identities[0]
        }, `Failed to fetch identity by ID "${id}"`)
    }

    /**
     * Fetches a single identity by exact name match and adds it to the cache.
     *
     * @param name - The identity name to search for
     * @returns The fetched identity document
     */
    public async fetchIdentityByName(name: string): Promise<IdentityDocument> {
        this.log.debug(`Fetching identity ${name}.`)

        const query = buildIdentityQuery(`name.exact:"${name}"`)

        return wrapConnectorError(async () => {
            const identities = await this.client.call<IdentityDocument>(
                (api: any, params: any) => api.search.searchPost(params).then((r: any) => r.data as IdentityDocument[]),
                { paginate: { mode: 'searchAfter', search: query as any }, priority: QueuePriority.HIGH, context: 'IdentityService>fetchIdentityByName searchPost' }
            )
            identities.forEach((identity) => this.run.addIdentity(identity.id, identity))
            return identities[0]
        }, `Failed to fetch identity by name "${name}"`)
    }

    /**
     * Fetch identity profile via Identities API (includes emailAddress not always present in search).
     */
    public async fetchIdentityProfileById(id: string): Promise<IdentityDocument | undefined> {
        if (!id) return undefined
        this.log.debug(`Fetching identity profile ${id}.`)

        return wrapConnectorError(async () => {
            const profile = await this.client.call<any>(
                (api: any) => api.identities.getIdentity({ id }).then((r: any) => r.data),
                { priority: QueuePriority.HIGH, context: 'IdentityService>fetchIdentityProfileById getIdentity' }
            )
            if (!profile?.id) return undefined
            const doc = this.identityDocumentFromProfile(profile)
            this.run.addIdentity(doc.id!, doc)
            return doc
        }, `Failed to fetch identity profile by ID "${id}"`)
    }

    private identityDocumentFromProfile(profile: any): IdentityDocument {
        const attributes =
            profile.attributes && typeof profile.attributes === 'object'
                ? { ...(profile.attributes as Record<string, unknown>) }
                : {}
        const emailAddress = profile.emailAddress ?? profile.email
        if (emailAddress && !attributes.email) {
            attributes.email = emailAddress
        }
        return {
            id: profile.id,
            name: profile.name,
            email: profile.email ?? profile.emailAddress ?? undefined,
            attributes,
            accounts: [],
            disabled: profile.identityStatus === 'INACTIVE',
            protected: false,
        } as IdentityDocument
    }


    // ------------------------------------------------------------------------
    // Public Lookup Methods
    // ------------------------------------------------------------------------

    /**
     * Retrieves an identity from the local cache by ID.
     *
     * @param id - The identity ID to look up
     * @returns The cached identity document, or undefined if not found
     */
    public getIdentityById(id?: string): IdentityDocument | undefined {
        if (!id) return undefined
        return this.run.getIdentity(id)
    }

    public async hydrateMissingIdentitiesById(identityIds: string[]): Promise<void> {
        const missing = [...new Set(identityIds.filter((id) => id && !this.getIdentityById(id)))]
        if (missing.length === 0) return

        const BATCH_SIZE = 50
        const batches: string[][] = []
        for (let i = 0; i < missing.length; i += BATCH_SIZE) {
            batches.push(missing.slice(i, i + BATCH_SIZE))
        }

        await promiseAllBatched(batches, async (batch) => {
            const queryStr = `id:("${batch.join('" OR "')}")`
            const query = buildIdentityQuery(queryStr)
            try {
                const identities = await this.client.call<IdentityDocument>(
                    (api: any, params: any) => api.search.searchPost(params).then((r: any) => r.data as IdentityDocument[]),
                    { paginate: { mode: 'searchAfter', search: query as any }, priority: QueuePriority.HIGH, context: 'IdentityService>hydrateMissingIdentitiesById searchPost' }
                )
                identities.forEach((identity) => {
                    this.run.addIdentity(identity.id, identity)
                })
            } catch (err) {
                const detail = err instanceof Error ? err.message : String(err)
                this.log.debug(`Failed to hydrate batch of missing identities: ${detail}`)
            }
        })
    }

    // ------------------------------------------------------------------------
    // Public Correlation Methods
    // ------------------------------------------------------------------------

    /**
     * Triggers asynchronous correlation of missing accounts to the fusion account's identity.
     * Correlation promises are tracked on the fusion account and resolved later during
     * {@link FusionAccount.resolvePendingOperations}.
     *
     * @param fusionAccount - The fusion account with missing accounts to correlate
     * @param accountIdFilter - If provided, only correlate these specific account IDs
     *   (used for per-source correlation where only a subset should be directly correlated)
     * @returns true if correlation was initiated, false if no identity ID is available
     */
    public async correlateAccounts(fusionAccount: FusionAccount, accountIdFilter?: string[]): Promise<boolean> {
        const { identityId } = fusionAccount

        if (!identityId) {
            this.log.warn(`Cannot correlate fusion account ${fusionAccount.name}: no identity ID`)
            return false
        }

        const targetIds = accountIdFilter ?? fusionAccount.missingAccountIds

        if (targetIds.length === 0) {
            this.log.info(`No accounts to correlate for fusion account ${fusionAccount.name}`)
            return true
        }

        this.log.recordEvent('correlation', { accounts: targetIds.length })
        if (this.log.getLogLevel() === 'debug') {
            this.log.debug(
                `Triggering correlation for ${targetIds.length} account(s) for fusion account ${fusionAccount.name}`
            )
        }

        await Promise.all(
            targetIds.map((accountId) => this.correlateSingleAccount(fusionAccount, accountId, identityId))
        )

        return true
    }

    private async correlateSingleAccount(
        fusionAccount: FusionAccount,
        accountId: string,
        identityId: string
    ): Promise<void> {
        const iscAccountId = this.sources.resolveIscAccountIdForManagedKey(accountId)
        if (!iscAccountId) {
            this.log.warn(
                `Skipping correlation for managed key "${accountId}": ISC account id not found in loaded source data`
            )
            return
        }

        // Optimistic: mark as correlated before the API call so the account
        // output reflects a successful correlation without waiting for the queue.
        // If the API call fails, the next aggregation will re-detect it as uncorrelated.
        fusionAccount.setCorrelatedAccount(accountId)

        const correlationPromise = this.buildCorrelationPromise(accountId, iscAccountId, identityId)
        fusionAccount.addCorrelationPromise(accountId, correlationPromise)
    }

    private buildCorrelationPromise(
        accountId: string,
        iscAccountId: string,
        identityId: string
    ): Promise<void> {
        const requestParameters: AccountsApiUpdateAccountRequest = {
            id: iscAccountId,
            requestBody: [{ op: 'replace', path: '/identityId', value: identityId }],
        }

        return this.client.call(
            (api: any) => api.accounts.updateAccount(requestParameters).then((r: any) => r.data),
            { priority: QueuePriority.LOW, context: `IdentityService>correlateAccounts ${accountId}` }
        )
            .then(() => {
                this.log.debug(
                    `Successfully correlated managed key ${accountId} (ISC id ${iscAccountId}) to identity ${identityId}`
                )
            })
            .catch((error) => {
                this.log.error(`Failed to correlate managed key ${accountId}: ${error}`)
            })
    }

    // ------------------------------------------------------------------------
    // Public Utility Methods
    // ------------------------------------------------------------------------

    /**
     * Removes a single identity from the cache by ID.
     * Called by FusionService.processFusionAccount after claiming a fusion account
     * for a given identity, so that processIdentities skips it rather than
     * relying solely on the hasFusionIdentity() lazy guard.
     *
     * @param id - The identity ID to remove from the cache
     */
    public deleteIdentity(id: string): void {
        this.run.removeIdentity(id)
    }

    /**
     * Checks if an identity is part of this aggregation's effective identity list.
     *
     * An identity is considered in-scope when either:
     * - It was returned by the configured `identityScopeQuery` global fetch, or
     * - It was explicitly requested by the connector via `additionalIdentityIds`
     *   to {@link fetchIdentities} (currently used to load the global reviewer /
     *   source-owner identity) and was successfully hydrated into the cache.
     *
     * Identities present in the cache for other reasons (e.g. hydrated by reporting
     * code via `hydrateMissingIdentitiesById` without going through `fetchIdentities`)
     * are NOT in scope.
     *
     * @param id - The identity ID to check
     * @returns true if the identity is in scope, false otherwise
     */
    public hasIdentityInScope(id?: string): boolean {
        if (!id) return false
        return this.identityIdsInScope.has(id)
    }

    /**
     * Clear the identity cache
     */
    public clear(): void {
        this.run.clearIdentities()
        this.identityIdsInScope.clear()
    }

    /**
     * Fetches and converts identity attributes into SchemaAttributes.
     */
    public async fetchIdentitySchemaAttributes(): Promise<any[]> {
        const identityAttrs = (await this.client.call(
            (api: any) => api.identityAttributes.listIdentityAttributes().then((r: any) => r.data ?? []),
            { priority: QueuePriority.HIGH, context: 'IdentityService>fetchIdentitySchemaAttributes' }
        ) as any[]) ?? []

        const allowedTypes = ['string', 'boolean', 'int', 'long']

        return identityAttrs
            .filter((attr) => attr && attr.name && attr.name.trim() !== '')
            .map((attr) => {
                const rawType = attr.type ? attr.type.toLowerCase() : 'string'
                const type = allowedTypes.includes(rawType) ? rawType : 'string'

                return {
                    name: attr.name,
                    description: attr.displayName || `${attr.name} from Identity`,
                    type,
                    multi: attr.multi ?? false,
                    entitlement: false,
                }
            })
    }
}

