import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionRun } from '../../model/fusionRun'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { wrapConnectorError } from '../../utils/error'
import { promiseAllBatched } from '../fusionService/collections'
import { LogService } from '../logService'
import {
    CompiledAccountJmespathFilter,
    compileAccountPageJmespathFilter,
} from './accountFilters'
import { SourceInfo } from './types'

export interface ManagedAccountFetcherDeps {
    log: LogService
    run: FusionRun
    managedSources: SourceInfo[]
    batchLimitedSourceNames: Set<string>
    batchCumulativeCount: Record<string, number>
    accountJmespathFiltersBySourceName: Map<string, CompiledAccountJmespathFilter>
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

function computeAggregateFetchProgress(sourceProgress: Map<string, { loaded: number; total?: number }>): {
    sumLoaded: number
    sumTotal: number
    allTotalsKnown: boolean
} {
    let sumLoaded = 0
    let sumTotal = 0
    let allTotalsKnown = true
    for (const { loaded, total } of sourceProgress.values()) {
        sumLoaded += loaded
        if (total !== undefined) sumTotal += total
        else allTotalsKnown = false
    }
    return { sumLoaded, sumTotal, allTotalsKnown }
}

function collectAccountsFromBatch(
    source: SourceInfo,
    batch: Account[],
    effectiveLimit: number | undefined,
    collectedCount: number,
    deps: Pick<ManagedAccountFetcherDeps, 'run' | 'accountJmespathFiltersBySourceName'>
): { collectedCount: number; discardedMachineCount: number; reachedLimit: boolean } {
    const filteredBatch = applyManagedJmespathFilter(source, batch, deps.accountJmespathFiltersBySourceName)
    let nextCollected = collectedCount
    let discardedMachineCount = 0

    for (const account of filteredBatch) {
        if (effectiveLimit !== undefined && nextCollected >= effectiveLimit) {
            return { collectedCount: nextCollected, discardedMachineCount, reachedLimit: true }
        }
        if (isMachineManagedAccount(account)) {
            discardedMachineCount++
            continue
        }

        const accountKey = getManagedAccountKeyFromAccount(account)
        if (!accountKey) {
            continue
        }
        deps.run.setManagedAccount(accountKey, account)
        nextCollected++
    }

    const reachedLimit = effectiveLimit !== undefined && nextCollected >= effectiveLimit
    return { collectedCount: nextCollected, discardedMachineCount, reachedLimit }
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
export async function fetchManagedAccounts(
    deps: ManagedAccountFetcherDeps,
    abortSignal?: AbortSignal
): Promise<void> {
    const { log, run, managedSources, batchLimitedSourceNames, batchCumulativeCount, accountJmespathFiltersBySourceName, fetchAccountsBySourceIdGenerator } = deps
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
        const sourceProgress = new Map<string, { loaded: number; total?: number }>()
        const reportAggregateFetchProgress = () => {
            const { sumLoaded, sumTotal, allTotalsKnown } = computeAggregateFetchProgress(sourceProgress)
            log.setProgress(sumLoaded, allTotalsKnown ? sumTotal : sumLoaded, 'fetched')
        }

        // ⚡ Bolt: Replace unbounded Promise.all mapping with bounded promiseAllBatched to prevent memory spikes
        await promiseAllBatched(
            sourcesWithLimits,
            async ({ source, effectiveLimit }) => {
                log.info(`Fetching accounts from source: ${source.name}`)
                let collectedCount = 0
                let discardedMachineCount = 0

                for await (const batch of fetchAccountsBySourceIdGenerator(
                    source.id,
                    abortSignal,
                    effectiveLimit,
                    (loaded, total) => {
                        sourceProgress.set(source.id, { loaded, total })
                        reportAggregateFetchProgress()
                    }
                )) {
                    const batchResult = collectAccountsFromBatch(
                        source,
                        batch,
                        effectiveLimit,
                        collectedCount,
                        { run, accountJmespathFiltersBySourceName }
                    )
                    collectedCount = batchResult.collectedCount
                    discardedMachineCount += batchResult.discardedMachineCount
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
            },
            10 // Default batch size to limit concurrent fetching across sources
        )
        log.debug(`Total managed accounts loaded: ${run.managedAccountsById.size}`)
    }, 'Failed to fetch managed accounts')
}

