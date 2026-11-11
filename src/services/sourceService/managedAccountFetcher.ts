import { AccountV2025 as Account } from 'sailpoint-api-client'
import { OrphanProcessingMode, SourceType } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'
import { getManagedAccountKeyFromAccount } from '../../model/managedAccountKey'
import { wrapConnectorError } from '../../utils/error'
import { yieldToEventLoop } from '../../utils/yieldToEventLoop'
import { LogService } from '../logService'
import { CompiledAccountJmespathFilter, compileAccountPageJmespathFilter } from './accountFilters'
import {
    createInternalRecordAccountBuilder,
    findInternalRecordSource,
    internalPackageMessage,
    type InternalRecordAccountBuilder,
    InternalRecordFormatError,
    iterateInternalRecords,
    loadInternalRecordManifest,
} from './internalRecordFormat'
import { pruneManagedAccountAttributes } from './referencedAttributeSet'
import { SourceInfo } from './types'

export interface ManagedAccountFetcherDeps {
    log: LogService
    run: FusionRun
    managedSources: SourceInfo[]
    batchLimitedSourceNames: Set<string>
    batchCumulativeCount: Record<string, number>
    batchWatermarkTimestamp?: Record<string, string>
    accountJmespathFiltersBySourceName: Map<string, CompiledAccountJmespathFilter>
    /** When set, managed source account attributes are pruned to this set at registration. */
    referencedAttributeSet?: ReadonlySet<string>
    /** Directory containing the packaged internal-record manifest and shards. */
    internalRecordsDir?: string
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
    return (
        source?.sourceType === SourceType.Orphan &&
        source.config?.orphanProcessingMode === OrphanProcessingMode.Ownership
    )
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

function extractAccountCreatedTimestamp(account: Account): string | undefined {
    const raw =
        (account.attributes as Record<string, unknown> | undefined)?.created ??
        (account as unknown as Record<string, unknown>).created
    if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw.trim()
    }
    if (raw instanceof Date && !isNaN(raw.getTime())) {
        return raw.toISOString()
    }
    return undefined
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
): Promise<{ collectedCount: number; discardedMachineCount: number; reachedLimit: boolean; newestCreated?: string }> {
    const filteredBatch = applyManagedJmespathFilter(source, batch, deps.accountJmespathFiltersBySourceName)
    let nextCollected = collectedCount
    let discardedMachineCount = 0
    let examinedSinceYield = 0
    let newestCreated: string | undefined

    for (const account of filteredBatch) {
        if (effectiveLimit !== undefined && nextCollected >= effectiveLimit) {
            return { collectedCount: nextCollected, discardedMachineCount, reachedLimit: true, newestCreated }
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
        const created = extractAccountCreatedTimestamp(account)
        if (created && (!newestCreated || created > newestCreated)) {
            newestCreated = created
        }
        examinedSinceYield++
        if (examinedSinceYield >= MANAGED_ACCOUNT_REGISTRATION_YIELD_INTERVAL) {
            examinedSinceYield = 0
            onCollected?.(nextCollected)
            await yieldToEventLoop()
        }
    }

    const reachedLimit = effectiveLimit !== undefined && nextCollected >= effectiveLimit
    return { collectedCount: nextCollected, discardedMachineCount, reachedLimit, newestCreated }
}

const INTERNAL_RECORD_BATCH_SIZE = 100

function internalRecordAccount(
    source: SourceInfo,
    build: InternalRecordAccountBuilder,
    values: string[],
    rawValues: string[]
): Account {
    const built = build(values, rawValues)
    return {
        nativeIdentity: built.nativeIdentity,
        name: built.name,
        sourceId: source.id,
        sourceName: source.name,
        attributes: built.attributes,
        disabled: false,
        locked: false,
        uncorrelated: true,
    } as Account
}

async function fetchInternalRecordSource(
    source: SourceInfo,
    effectiveLimit: number | undefined,
    deps: ManagedAccountFetcherDeps,
    sourceProgress: Map<string, { registered: number; total?: number }>,
    reportAggregateFetchProgress: () => void
): Promise<{ collectedCount: number; discardedMachineCount: number; newestCreated?: string }> {
    const fileName = source.internalRecord?.fileName
    if (!fileName || !deps.internalRecordsDir) {
        throw new InternalRecordFormatError(internalPackageMessage(fileName || source.name))
    }
    const manifest = loadInternalRecordManifest(deps.internalRecordsDir)
    const packaged = findInternalRecordSource(manifest, fileName)
    if (!packaged) {
        throw new InternalRecordFormatError(internalPackageMessage(fileName))
    }
    sourceProgress.set(source.id, { registered: 0, total: packaged.recordCount })
    reportAggregateFetchProgress()
    deps.log.info(
        `Loading Internal Record source "${source.name}" from "${fileName}" (${packaged.recordCount} accounts)`
    )

    let collectedCount = 0
    let discardedMachineCount = 0
    let newestCreated: string | undefined
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
        if (batchResult.newestCreated && (!newestCreated || batchResult.newestCreated > newestCreated)) {
            newestCreated = batchResult.newestCreated
        }
        batch = []
    }

    const entry = source.internalRecord
    if (!entry) {
        throw new InternalRecordFormatError(internalPackageMessage(source.name))
    }
    // Only referenced columns are built, so the later prune has nothing to drop and does not rebuild the bag.
    const build = createInternalRecordAccountBuilder(entry, packaged.headers, deps.referencedAttributeSet)
    for await (const record of iterateInternalRecords(deps.internalRecordsDir, fileName)) {
        if (effectiveLimit !== undefined && collectedCount >= effectiveLimit) break
        batch.push(internalRecordAccount(source, build, record.values, record.rawValues))
        if (batch.length >= INTERNAL_RECORD_BATCH_SIZE) await flush()
    }
    await flush()
    return { collectedCount, discardedMachineCount, newestCreated }
}

/**
 * Fetch and cache managed accounts from all managed sources.
 *
 * Progressive Onboarding Ramp (Batch Mode):
 * When a source has an `accountLimit`, the effective limit grows monotonically across runs
 * so that previously fetched accounts are always included in subsequent runs.
 * The effective limit is `batchCumulativeCount[sourceName] + accountLimit`.
 * After fetching, the actual number of accounts retrieved is stored as the
 * new cumulative count (monotonically non-decreasing via Math.max) and the newest
 * account creation timestamp is recorded in `batchWatermarkTimestamp`.
 */
export async function fetchManagedAccounts(deps: ManagedAccountFetcherDeps, abortSignal?: AbortSignal): Promise<void> {
    const {
        log,
        run,
        managedSources,
        batchLimitedSourceNames,
        batchCumulativeCount,
        batchWatermarkTimestamp,
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
                if (!source.internalProvenance) {
                    log.info(`Fetching accounts from source: ${source.name}`)
                }
                let collectedCount = 0
                let discardedMachineCount = 0

                if (source.internalProvenance) {
                    const internalResult = await fetchInternalRecordSource(
                        source,
                        effectiveLimit,
                        deps,
                        sourceProgress,
                        reportAggregateFetchProgress
                    )
                    collectedCount = internalResult.collectedCount
                    discardedMachineCount = internalResult.discardedMachineCount
                    const current = sourceProgress.get(source.id) ?? {}
                    sourceProgress.set(source.id, { ...current, registered: collectedCount })
                    reportAggregateFetchProgress()
                    log.info(`Internal Record source "${source.name}": collected ${collectedCount} account(s)`)
                    if (discardedMachineCount > 0) {
                        log.warn(
                            `Source ${source.name}: discarded ${discardedMachineCount} managed machine account(s) where isMachine=true`
                        )
                    }
                    if (batchLimitedSourceNames.has(source.name)) {
                        batchCumulativeCount[source.name] = Math.max(
                            batchCumulativeCount[source.name] ?? 0,
                            collectedCount
                        )
                        if (internalResult.newestCreated && batchWatermarkTimestamp) {
                            const previous = batchWatermarkTimestamp[source.name]
                            if (!previous || internalResult.newestCreated > previous) {
                                batchWatermarkTimestamp[source.name] = internalResult.newestCreated
                            }
                        }
                    }
                    return
                }

                let newestCreated: string | undefined
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
                    if (batchResult.newestCreated && (!newestCreated || batchResult.newestCreated > newestCreated)) {
                        newestCreated = batchResult.newestCreated
                    }
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
                    batchCumulativeCount[source.name] = Math.max(
                        batchCumulativeCount[source.name] ?? 0,
                        collectedCount
                    )
                    if (newestCreated && batchWatermarkTimestamp) {
                        const previous = batchWatermarkTimestamp[source.name]
                        if (!previous || newestCreated > previous) {
                            batchWatermarkTimestamp[source.name] = newestCreated
                        }
                    }
                    log.debug(`Source ${source.name}: updated cumulative count to ${batchCumulativeCount[source.name]}`)
                }
            })
        )
        log.debug(`Total managed accounts loaded: ${run.managedAccountsById.size}`)
    }, 'Failed to fetch managed accounts')
}
