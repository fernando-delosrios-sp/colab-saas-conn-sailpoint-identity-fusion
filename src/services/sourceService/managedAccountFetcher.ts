import { AccountV2025 as Account } from 'sailpoint-api-client'
import { OrphanProcessingMode, SourceType } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { wrapConnectorError } from '../../utils/error'
import { yieldToEventLoop } from '../../utils/yieldToEventLoop'
import { LogService } from '../logService'
import { CompiledAccountJmespathFilter, compileAccountPageJmespathFilter } from './accountFilters'
import {
    findHistoricalRecordSource,
    historicalPackageMessage,
    HistoricalRecordFormatError,
    iterateHistoricalRecords,
    loadHistoricalRecordManifest,
} from './historicalRecordFormat'
import { pruneManagedAccountAttributes } from './referencedAttributeSet'
import { SourceInfo } from './types'

export interface ManagedAccountFetcherDeps {
    log: LogService
    run: FusionRun
    managedSources: SourceInfo[]
    batchLimitedSourceNames: Set<string>
    batchCumulativeCount: Record<string, number>
    accountJmespathFiltersBySourceName: Map<string, CompiledAccountJmespathFilter>
    /** When set, managed source account attributes are pruned to this set at registration. */
    referencedAttributeSet?: ReadonlySet<string>
    /** Directory containing the packaged historical-record manifest and shards. */
    historicalRecordsDir?: string
    fetchAccountsBySourceIdGenerator: (
        sourceId: string,
        abortSignal?: AbortSignal,
        limit?: number,
        onPageProgress?: (loaded: number, total?: number) => void
    ) => AsyncGenerator<Account[], void, unknown>
}

/**
 * Lazily compile and cache per-source Accounts JMESPath filters.
 */
export function getCompiledAccountJmespathFilter(
    sourceInfo: SourceInfo,
    accountJmespathFiltersBySourceName: Map<string, CompiledAccountJmespathFilter>
): CompiledAccountJmespathFilter | undefined {
    if (!sourceInfo.isManaged) {
        return undefined
    }

    const expression = sourceInfo.config?.accountJmespathFilter
    if (!expression || expression.trim().length === 0) {
        accountJmespathFiltersBySourceName.delete(sourceInfo.name)
        return undefined
    }

    const cached = accountJmespathFiltersBySourceName.get(sourceInfo.name)
    if (cached && cached.expression === expression) {
        return cached
    }

    const compiled = compileAccountPageJmespathFilter(sourceInfo.name, expression)
    if (!compiled) {
        accountJmespathFiltersBySourceName.delete(sourceInfo.name)
        return undefined
    }

    accountJmespathFiltersBySourceName.set(sourceInfo.name, compiled)
    return compiled
}

/**
 * Applies Accounts JMESPath filter on a paginated batch represented as { accounts: [...] }.
 */
function applyManagedJmespathFilter(
    sourceInfo: SourceInfo,
    accounts: Account[],
    accountJmespathFiltersBySourceName: Map<string, CompiledAccountJmespathFilter>
): Account[] {
    const compiled = getCompiledAccountJmespathFilter(sourceInfo, accountJmespathFiltersBySourceName)
    if (!compiled) {
        return accounts
    }
    return compiled.filterAccountPage(accounts)
}

export function matchesManagedJmespathFilter(
    sourceInfo: SourceInfo,
    account: Account,
    accountJmespathFiltersBySourceName: Map<string, CompiledAccountJmespathFilter>
): boolean {
    if (!sourceInfo.isManaged) {
        return true
    }
    return applyManagedJmespathFilter(sourceInfo, [account], accountJmespathFiltersBySourceName).length > 0
}

/**
 * Client-side machine account check. This cannot be done via ISC account filters.
 */
export function isMachineManagedAccount(account: Account): boolean {
    return account.isMachine === true
}

/**
 * An established owner identity has a non-empty id. A missing `ownerIdentity`, or one whose id is blank, is not established.
 */
function hasEstablishedOwnerIdentity(account: Account): boolean {
    const id = account.ownerIdentity?.id
    return typeof id === 'string' && id.trim().length > 0
}

export function isOwnershipModeSource(source: SourceInfo | undefined): boolean {
    return source?.sourceType === SourceType.Orphan && source.config?.orphanProcessingMode === OrphanProcessingMode.Ownership
}

/** Machine account on an Ownership-mode source with no established owner identity. */
export function isOwnershipEligibleManagedAccount(account: Account, source: SourceInfo | undefined): boolean {
    return isOwnershipModeSource(source) && isMachineManagedAccount(account) && !hasEstablishedOwnerIdentity(account)
}

/**
 * Remove machine accounts from managed-source batches before further processing.
 */
export function filterManagedMachineAccounts(accounts: Account[]): {
    filteredAccounts: Account[]
    discardedMachineCount: number
} {
    const filteredAccounts: Account[] = []
    let discardedMachineCount = 0

    for (const account of accounts) {
        if (isMachineManagedAccount(account)) {
            discardedMachineCount++
            continue
        }
        filteredAccounts.push(account)
    }

    return { filteredAccounts, discardedMachineCount }
}

function computeAggregateFetchProgress(sourceProgress: Map<string, { registered: number; total?: number }>): {
    sumRegistered: number
    sumTotal: number
    allTotalsKnown: boolean
} {
    let sumRegistered = 0
    let sumTotal = 0
    let allTotalsKnown = true
    for (const { registered, total } of sourceProgress.values()) {
        sumRegistered += registered
        if (total !== undefined) sumTotal += total
        else allTotalsKnown = false
    }
    return { sumRegistered, sumTotal, allTotalsKnown }
}

/** Accounts examined before registration yields, so one page cannot hold the event loop. */
export const MANAGED_ACCOUNT_REGISTRATION_YIELD_INTERVAL = 100

async function collectAccountsFromBatch(
    source: SourceInfo,
    batch: Account[],
    effectiveLimit: number | undefined,
    collectedCount: number,
    deps: Pick<ManagedAccountFetcherDeps, 'run' | 'accountJmespathFiltersBySourceName' | 'referencedAttributeSet'>,
    onCollected?: (collectedCount: number) => void
): Promise<{ collectedCount: number; discardedMachineCount: number; reachedLimit: boolean }> {
    const filteredBatch = applyManagedJmespathFilter(source, batch, deps.accountJmespathFiltersBySourceName)
    let nextCollected = collectedCount
    let discardedMachineCount = 0
    let examinedSinceYield = 0

    for (const account of filteredBatch) {
        if (effectiveLimit !== undefined && nextCollected >= effectiveLimit) {
            return { collectedCount: nextCollected, discardedMachineCount, reachedLimit: true }
        }
        if (isOwnershipModeSource(source)) {
            if (!isMachineManagedAccount(account) || hasEstablishedOwnerIdentity(account)) {
                continue
            }
        } else if (isMachineManagedAccount(account)) {
            discardedMachineCount++
            continue
        }

        if (deps.referencedAttributeSet) {
            pruneManagedAccountAttributes(account, deps.referencedAttributeSet)
        }

        const accountKey = getManagedAccountKeyFromAccount(account)
        if (!accountKey) {
            continue
        }
        deps.run.setManagedAccount(accountKey, account)
        nextCollected++
        examinedSinceYield++
        if (examinedSinceYield >= MANAGED_ACCOUNT_REGISTRATION_YIELD_INTERVAL) {
            examinedSinceYield = 0
            onCollected?.(nextCollected)
            await yieldToEventLoop()
        }
    }

    const reachedLimit = effectiveLimit !== undefined && nextCollected >= effectiveLimit
    return { collectedCount: nextCollected, discardedMachineCount, reachedLimit }
}

const HISTORICAL_RECORD_BATCH_SIZE = 100

function historicalRecordAccount(source: SourceInfo, headers: string[], values: string[]): Account {
    const attributes: Record<string, string> = {}
    headers.forEach((header, index) => {
        attributes[header] = values[index] ?? ''
    })
    const nativeIdentity = attributes.nativeIdentity
    return {
        nativeIdentity,
        name: attributes.name || nativeIdentity,
        sourceId: source.id,
        sourceName: source.name,
        attributes,
        disabled: false,
        locked: false,
        uncorrelated: true,
    } as Account
}

async function fetchHistoricalRecordSource(
    source: SourceInfo,
    effectiveLimit: number | undefined,
    deps: ManagedAccountFetcherDeps,
    sourceProgress: Map<string, { registered: number; total?: number }>,
    reportAggregateFetchProgress: () => void
): Promise<{ collectedCount: number; discardedMachineCount: number }> {
    const fileName = source.config?.historicalRecordFile
    if (!fileName || !deps.historicalRecordsDir) {
        throw new HistoricalRecordFormatError(historicalPackageMessage(fileName || source.name))
    }
    const manifest = loadHistoricalRecordManifest(deps.historicalRecordsDir)
    const packaged = findHistoricalRecordSource(manifest, fileName)
    if (!packaged) {
        throw new HistoricalRecordFormatError(historicalPackageMessage(fileName))
    }
    sourceProgress.set(source.id, { registered: 0, total: packaged.recordCount })
    reportAggregateFetchProgress()

    let collectedCount = 0
    let discardedMachineCount = 0
    let batch: Account[] = []
    const flush = async () => {
        if (batch.length === 0) return
        const batchResult = await collectAccountsFromBatch(
            source,
            batch,
            effectiveLimit,
            collectedCount,
            deps,
            (registered) => {
                const current = sourceProgress.get(source.id) ?? {}
                sourceProgress.set(source.id, { ...current, registered })
                reportAggregateFetchProgress()
            }
        )
        collectedCount = batchResult.collectedCount
        discardedMachineCount += batchResult.discardedMachineCount
        batch = []
    }

    for await (const record of iterateHistoricalRecords(deps.historicalRecordsDir, fileName)) {
        if (effectiveLimit !== undefined && collectedCount >= effectiveLimit) break
        batch.push(historicalRecordAccount(source, record.headers, record.values))
        if (batch.length >= HISTORICAL_RECORD_BATCH_SIZE) await flush()
    }
    await flush()
    return { collectedCount, discardedMachineCount }
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
export async function fetchManagedAccounts(deps: ManagedAccountFetcherDeps, abortSignal?: AbortSignal): Promise<void> {
    const {
        log,
        run,
        managedSources,
        batchLimitedSourceNames,
        batchCumulativeCount,
        accountJmespathFiltersBySourceName,
        fetchAccountsBySourceIdGenerator,
    } = deps
    log.debug(`Fetching managed accounts from ${managedSources.length} source(s)`)

    const sourcesWithLimits = managedSources.map((s) => {
        const baseLimit = s.config?.accountLimit
        let effectiveLimit: number | undefined
        if (typeof baseLimit === 'number' && Number.isFinite(baseLimit)) {
            const cumulativeCount = batchCumulativeCount[s.name] ?? 0
            effectiveLimit = cumulativeCount + baseLimit
            log.debug(`Source ${s.name}: effectiveLimit=${effectiveLimit}`)
        }
        return { source: s, effectiveLimit }
    })

    await wrapConnectorError(async () => {
        const sourceProgress = new Map<string, { registered: number; total?: number }>(
            managedSources.map((source) => [source.id, { registered: 0 }])
        )
        const reportAggregateFetchProgress = () => {
            const { sumRegistered, sumTotal, allTotalsKnown } = computeAggregateFetchProgress(sourceProgress)
            log.setFetchPopulationProgress('managed-accounts', sumRegistered, allTotalsKnown ? sumTotal : sumRegistered)
        }

        await Promise.all(
            sourcesWithLimits.map(async ({ source, effectiveLimit }) => {
                log.info(`Fetching accounts from source: ${source.name}`)
                let collectedCount = 0
                let discardedMachineCount = 0

                if (source.internalProvenance) {
                    const historicalResult = await fetchHistoricalRecordSource(
                        source,
                        effectiveLimit,
                        deps,
                        sourceProgress,
                        reportAggregateFetchProgress
                    )
                    collectedCount = historicalResult.collectedCount
                    discardedMachineCount = historicalResult.discardedMachineCount
                    const current = sourceProgress.get(source.id) ?? {}
                    sourceProgress.set(source.id, { ...current, registered: collectedCount })
                    reportAggregateFetchProgress()
                    log.info(`Source ${source.name}: collected ${collectedCount} account(s)`)
                    if (discardedMachineCount > 0) {
                        log.warn(
                            `Source ${source.name}: discarded ${discardedMachineCount} managed machine account(s) where isMachine=true`
                        )
                    }
                    if (batchLimitedSourceNames.has(source.name)) {
                        batchCumulativeCount[source.name] = collectedCount
                    }
                    return
                }

                for await (const batch of fetchAccountsBySourceIdGenerator(
                    source.id,
                    abortSignal,
                    effectiveLimit,
                    (_loaded, total) => {
                        const current = sourceProgress.get(source.id) ?? { registered: collectedCount }
                        sourceProgress.set(source.id, { ...current, total })
                    }
                )) {
                    const batchResult = await collectAccountsFromBatch(
                        source,
                        batch,
                        effectiveLimit,
                        collectedCount,
                        {
                            run,
                            accountJmespathFiltersBySourceName,
                            referencedAttributeSet: deps.referencedAttributeSet,
                        },
                        (registered) => {
                            const current = sourceProgress.get(source.id) ?? {}
                            sourceProgress.set(source.id, { ...current, registered })
                            reportAggregateFetchProgress()
                        }
                    )
                    collectedCount = batchResult.collectedCount
                    discardedMachineCount += batchResult.discardedMachineCount
                    const current = sourceProgress.get(source.id) ?? {}
                    sourceProgress.set(source.id, { ...current, registered: collectedCount })
                    reportAggregateFetchProgress()
                    // Completed pages otherwise drain as microtasks and starve keep-alives.
                    await yieldToEventLoop()
                    if (batchResult.reachedLimit) {
                        log.info(`Source ${source.name}: reached effectiveLimit of ${effectiveLimit}, stopping`)
                        break
                    }
                }

                log.info(`Source ${source.name}: collected ${collectedCount} account(s)`)
                if (discardedMachineCount > 0) {
                    log.warn(
                        `Source ${source.name}: discarded ${discardedMachineCount} managed machine account(s) where isMachine=true`
                    )
                }

                if (batchLimitedSourceNames.has(source.name)) {
                    batchCumulativeCount[source.name] = collectedCount
                    log.debug(`Source ${source.name}: updated cumulative count to ${collectedCount}`)
                }
            })
        )
        log.debug(`Total managed accounts loaded: ${run.managedAccountsById.size}`)
    }, 'Failed to fetch managed accounts')
}
