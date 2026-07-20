import { SourceType } from '../../model/config'
import { SourceInfo } from '../sourceService'
import { FusionAccount } from '../../model/account'
import { coerceBoolean } from '../../utils/safeRead'
import type { LogService } from '../logService'

export interface CandidateRegistryDeps {
    readonly fusionAccountMap: Map<string, FusionAccount>
    readonly sourcesByName: Map<string, SourceInfo>
    readonly log: LogService
}

export class CandidateRegistry {
    private readonly candidatesBySource = new Map<string, Set<string>>()

    constructor(private readonly deps: CandidateRegistryDeps) {}

    register(fusionAccount: FusionAccount): void {
        const { managedKey } = fusionAccount
        if (!managedKey) return
        if (!this.isDeferredMatchingEnabled(fusionAccount)) return
        const sourceKey = this.sourceKey(fusionAccount.sourceName)
        if (!sourceKey) return
        const setForSource = this.candidatesBySource.get(sourceKey) ?? new Set<string>()
        setForSource.add(managedKey)
        this.candidatesBySource.set(sourceKey, setForSource)
    }

    *queryForSource(sourceName: string | null | undefined): Iterable<FusionAccount> {
        const sourceKey = this.sourceKey(sourceName)
        const sourceCandidates = this.candidatesBySource.get(sourceKey)
        if (!sourceCandidates) return
        for (const managedKey of sourceCandidates) {
            const account = this.deps.fusionAccountMap.get(managedKey)
            if (account) yield account
        }
    }

    clear(): void {
        this.candidatesBySource.clear()
    }

    private sourceKey(sourceName: string | null | undefined): string {
        return sourceName ?? ''
    }

    private isDeferredMatchingEnabled(fusionAccount: FusionAccount): boolean {
        const { sourceName } = fusionAccount
        if (!sourceName) return false
        const info = this.deps.sourcesByName.get(sourceName)
        const sourceType = info?.sourceType ?? SourceType.Authoritative
        if (sourceType !== SourceType.Authoritative) return false
        if (!info?.config) return true
        return coerceBoolean(info.config.deferredMatching) ?? true
    }
}
