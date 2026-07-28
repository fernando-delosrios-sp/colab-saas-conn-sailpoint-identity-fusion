import { SourceType } from '../../model/config'
import { SourceInfo } from '../sourceService'
import { FusionAccount } from '../../model/account'
import { normalizeCompositeManagedAccountKey } from '../../model/managedAccountKey'
import { coerceBoolean } from '../../utils/safeRead'
import { deferredMatchSourceName } from './matchingHelpers'
import type { LogService } from '../logService'

export type DeferredCandidateTier = 'persisted' | 'finalized' | 'pending'

interface CandidateEntry {
    account: FusionAccount
    tier: DeferredCandidateTier
}

export interface CandidateRegistryDeps {
    readonly getFusionAccount: (key: string) => FusionAccount | undefined
    readonly sourcesByName: Map<string, SourceInfo>
    readonly log?: LogService
}

export class CandidateRegistry {
    /** Deferred candidates keyed by managed source name, then managed account key. */
    private readonly candidatesBySource = new Map<string, Map<string, CandidateEntry>>()
    /** Why registration was refused, for diagnosing an empty candidate pool. */
    private readonly skipped = { noManagedKey: 0, disabled: 0, noSourceName: 0 }
    private summaryLogged = false

    constructor(private readonly deps: CandidateRegistryDeps) {}

    /** Seed candidates from fusion accounts loaded before this sweep (prior aggregation runs). */
    registerPersisted(fusionAccount: FusionAccount): void {
        this.registerWithTier(fusionAccount, 'persisted', { overwritePersisted: true })
    }

    /** Register a non-match finalized earlier in the current sweep. */
    registerFinalized(fusionAccount: FusionAccount): void {
        this.registerWithTier(fusionAccount, 'finalized', { overwritePersisted: false })
    }

    /** Register a managed account awaiting deferred-phase scoring in the current sweep. */
    registerPending(fusionAccount: FusionAccount): void {
        this.registerWithTier(fusionAccount, 'pending', { overwritePersisted: false })
    }

    unregister(fusionAccount: FusionAccount): void {
        const managedKey = this.candidateKey(fusionAccount)
        if (!managedKey) return
        const sourceKey = this.sourceKey(deferredMatchSourceName(fusionAccount))
        const mapForSource = this.candidatesBySource.get(sourceKey)
        if (!mapForSource) return
        mapForSource.delete(managedKey)
        if (mapForSource.size === 0) {
            this.candidatesBySource.delete(sourceKey)
        }
    }

    *queryForSource(sourceName: string | null | undefined): Iterable<FusionAccount> {
        this.logDiagnosticsOnce()
        const sourceKey = this.sourceKey(sourceName)
        const sourceCandidates = this.candidatesBySource.get(sourceKey)
        if (!sourceCandidates) return
        for (const entry of sourceCandidates.values()) {
            yield entry.account
        }
    }

    hasPersistedCandidates(): boolean {
        for (const sourceCandidates of this.candidatesBySource.values()) {
            for (const entry of sourceCandidates.values()) {
                if (entry.tier === 'persisted') return true
            }
        }
        return false
    }

    getCandidateTier(fusionAccount: FusionAccount): DeferredCandidateTier | undefined {
        const managedKey = this.candidateKey(fusionAccount)
        if (!managedKey) return undefined
        const sourceKey = this.sourceKey(deferredMatchSourceName(fusionAccount))
        return this.candidatesBySource.get(sourceKey)?.get(managedKey)?.tier
    }

    clear(): void {
        this.candidatesBySource.clear()
        this.skipped.noManagedKey = 0
        this.skipped.disabled = 0
        this.skipped.noSourceName = 0
        this.summaryLogged = false
    }

    private registerWithTier(
        fusionAccount: FusionAccount,
        tier: DeferredCandidateTier,
        options: { overwritePersisted: boolean }
    ): void {
        const managedKey = this.candidateKey(fusionAccount)
        if (!managedKey) {
            this.skipped.noManagedKey++
            return
        }
        if (!this.isDeferredMatchingEnabled(fusionAccount)) {
            this.skipped.disabled++
            return
        }
        const sourceKey = this.sourceKey(deferredMatchSourceName(fusionAccount))
        if (!sourceKey) {
            this.skipped.noSourceName++
            return
        }
        const mapForSource = this.candidatesBySource.get(sourceKey) ?? new Map<string, CandidateEntry>()
        const existing = mapForSource.get(managedKey)
        if (existing?.tier === 'persisted' && !options.overwritePersisted) {
            return
        }
        mapForSource.set(managedKey, { account: fusionAccount, tier })
        this.candidatesBySource.set(sourceKey, mapForSource)
    }

    /**
     * Emits the registry snapshot on the first query of a sweep, by which point both the
     * persisted seed and the current-sweep registrations are complete.
     */
    private logDiagnosticsOnce(): void {
        if (this.summaryLogged) return
        this.summaryLogged = true
        const { total, persisted, bySource, skipped } = this.diagnostics()
        this.deps.log?.info(
            `[deferred-diag] registry total=${total} persisted=${persisted} bySource=${JSON.stringify(bySource)} ` +
                `skipped=${JSON.stringify(skipped)} ` +
                `knownSources=${JSON.stringify(
                    Array.from(this.deps.sourcesByName.entries()).map(([name, info]) => ({
                        name,
                        sourceType: info.sourceType,
                        deferredMatching: info.config?.deferredMatching,
                    }))
                )}`
        )
    }

    /**
     * Snapshot of registry contents and rejection reasons. Logged once per sweep so an empty
     * deferred pool can be attributed to a specific gate rather than guessed at.
     */
    diagnostics(): {
        total: number
        persisted: number
        bySource: Record<string, number>
        skipped: Record<string, number>
    } {
        const bySource: Record<string, number> = {}
        let persisted = 0
        for (const [sourceKey, accounts] of this.candidatesBySource) {
            bySource[sourceKey || '(none)'] = accounts.size
            for (const entry of accounts.values()) {
                if (entry.tier === 'persisted') persisted++
            }
        }
        return { total: this.count(), persisted, bySource, skipped: { ...this.skipped } }
    }

    /** Total deferred-match candidates registered for the current sweep. */
    count(): number {
        let total = 0
        for (const accounts of this.candidatesBySource.values()) {
            total += accounts.size
        }
        return total
    }

    private sourceKey(sourceName: string | null | undefined): string {
        return sourceName ?? ''
    }

    private candidateKey(fusionAccount: FusionAccount): string | undefined {
        const originAccount = fusionAccount.originAccountId?.trim()
        if (originAccount) {
            return normalizeCompositeManagedAccountKey(originAccount) ?? originAccount
        }
        return fusionAccount.managedKey
    }

    private isDeferredMatchingEnabled(fusionAccount: FusionAccount): boolean {
        const sourceName = deferredMatchSourceName(fusionAccount)
        if (!sourceName) return false
        const info = this.deps.sourcesByName.get(sourceName)
        const sourceType = info?.sourceType ?? SourceType.Authoritative
        if (sourceType !== SourceType.Authoritative) return false
        if (!info?.config) return true
        return coerceBoolean(info.config.deferredMatching) ?? true
    }
}

