import { describe, it, expect, vi } from 'vitest'
import { CandidateRegistry, CandidateRegistryDeps } from '../../matchingService/candidateRegistry'
import { SourceType } from '../../../model/config'
import { FusionAccount } from '../../../model/account'

function makeRegistry(overrides: Partial<CandidateRegistryDeps> & { fusionMap?: Map<string, FusionAccount> } = {}): CandidateRegistry {
    const fusionMap = overrides.fusionMap ?? new Map()
    const { fusionMap: _, ...rest } = overrides
    const deps: CandidateRegistryDeps = {
        getFusionAccount: (key: string) => fusionMap.get(key),
        sourcesByName: new Map(),
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        ...rest,
    }
    return new CandidateRegistry(deps)
}

describe('CandidateRegistry', () => {
    it('registers deferred-enabled authoritative account', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: 'src-a::nat-1', sourceName: 'Source A', sourceType: SourceType.Authoritative } as any
        registry.registerPending(account)
        const result = [...registry.queryForSource('Source A')]
        expect(result).toHaveLength(1)
        expect(result[0]).toBe(account)
    })

    it('returns registered account without fusionAccountMap lookup', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources, fusionMap: new Map() })
        const account = { managedKey: 'src-a::nat-1', sourceName: 'Source A', sourceType: SourceType.Authoritative } as any
        registry.registerPending(account)
        expect([...registry.queryForSource('Source A')]).toEqual([account])
    })

    it('indexes persisted Fusion accounts by originSource instead of fusion connector sourceName', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        FusionAccount.configure({
            sources: [{ name: 'Source A', enabled: true }],
        } as any)
        const persisted = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-1',
            name: 'Persisted Non Match',
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            attributes: {
                originSource: 'Source A',
                originAccount: 'source-a-id::native-persisted',
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as any)
        persisted.collections.statuses.setNonMatched(persisted.name, persisted.sourceName)
        registry.registerPersisted(persisted)
        expect([...registry.queryForSource('Source A')]).toEqual([persisted])
        expect([...registry.queryForSource('Identity Fusion NG')]).toHaveLength(0)
    })

    it('skip non-authoritative account', () => {
        const sources = new Map()
        sources.set('Source B', { sourceType: SourceType.Record, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: 'src-b::nat-1', sourceName: 'Source B', sourceType: SourceType.Record } as any
        registry.registerPending(account)
        expect([...registry.queryForSource('Source B')]).toHaveLength(0)
    })

    it('skip deferred-disabled account', () => {
        const sources = new Map()
        sources.set('Source C', { sourceType: SourceType.Authoritative, config: { deferredMatching: false } })
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: 'src-c::nat-1', sourceName: 'Source C', sourceType: SourceType.Authoritative } as any
        registry.registerPending(account)
        expect([...registry.queryForSource('Source C')]).toHaveLength(0)
    })

    it('skip missing managedKey', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: undefined, sourceName: 'Source A' } as any
        registry.registerPending(account)
        expect([...registry.queryForSource('Source A')]).toHaveLength(0)
    })

    it('queryForSource returns only matching source candidates', () => {
        const sources = new Map()
        sources.set('A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        sources.set('B', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const fusionMap = new Map()
        const registry = makeRegistry({ sourcesByName: sources, fusionMap })
        const accountA = { managedKey: 'src-a::nat-1', sourceName: 'A' } as any
        const accountB = { managedKey: 'src-b::nat-1', sourceName: 'B' } as any
        fusionMap.set('src-a::nat-1', accountA)
        fusionMap.set('src-b::nat-1', accountB)
        registry.registerPending(accountA)
        registry.registerPending(accountB)
        expect([...registry.queryForSource('A')]).toHaveLength(1)
        expect([...registry.queryForSource('B')]).toHaveLength(1)
        expect([...registry.queryForSource('C')]).toHaveLength(0)
    })

    it('queryForSource returns empty iterable for unknown source', () => {
        const registry = makeRegistry()
        expect([...registry.queryForSource('nonexistent')]).toHaveLength(0)
    })

    it('clear removes all entries', () => {
        const sources = new Map()
        sources.set('A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const fusionMap = new Map()
        const account = { managedKey: 'src-a::nat-1', sourceName: 'A' } as any
        fusionMap.set('src-a::nat-1', account)
        const registry = makeRegistry({ sourcesByName: sources, fusionMap })
        registry.registerPending(account)
        registry.clear()
        expect([...registry.queryForSource('A')]).toHaveLength(0)
    })

    it('does not overwrite persisted seeds when the same managed key registers as pending', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        FusionAccount.configure({ sources: [{ name: 'Source A', enabled: true }] } as any)
        const persisted = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-1',
            name: 'Persisted',
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            attributes: {
                originSource: 'Source A',
                originAccount: 'source-a-id::native-1',
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as any)
        const pending = { managedKey: 'source-a-id::native-1', sourceName: 'Source A', originAccountId: 'source-a-id::native-1', originSource: 'Source A' } as any
        registry.registerPersisted(persisted)
        registry.registerPending(pending)
        const result = [...registry.queryForSource('Source A')]
        expect(result).toHaveLength(1)
        expect(result[0]).toBe(persisted)
        expect(registry.getCandidateTier(persisted)).toBe('persisted')
    })

    it('indexes persisted Fusion accounts by originAccount when present', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        FusionAccount.configure({ sources: [{ name: 'Source A', enabled: true }] } as any)
        const persisted = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-only',
            name: 'Persisted',
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            attributes: {
                originSource: 'Source A',
                originAccount: 'source-a-id::native-persisted',
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as any)
        registry.registerPersisted(persisted)
        expect([...registry.queryForSource('Source A')]).toEqual([persisted])
    })
})

