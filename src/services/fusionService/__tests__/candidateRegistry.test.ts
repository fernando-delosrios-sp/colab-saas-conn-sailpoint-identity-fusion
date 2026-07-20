import { describe, it, expect, vi } from 'vitest'
import { CandidateRegistry, CandidateRegistryDeps } from '../../matchingService/candidateRegistry'
import { SourceType } from '../../../model/config'

function makeRegistry(overrides: Partial<CandidateRegistryDeps> = {}): CandidateRegistry {
    const deps: CandidateRegistryDeps = {
        fusionAccountMap: new Map(),
        sourcesByName: new Map(),
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        ...overrides,
    }
    return new CandidateRegistry(deps)
}

describe('CandidateRegistry', () => {
    it('registers deferred-enabled authoritative account', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const fusionMap = new Map()
        const registry = makeRegistry({ sourcesByName: sources, fusionAccountMap: fusionMap })
        const account = { managedKey: 'src-a::nat-1', sourceName: 'Source A', sourceType: SourceType.Authoritative } as any
        fusionMap.set('src-a::nat-1', account)
        registry.register(account)
        const result = [...registry.queryForSource('Source A')]
        expect(result).toHaveLength(1)
        expect(result[0]).toBe(account)
    })

    it('skip non-authoritative account', () => {
        const sources = new Map()
        sources.set('Source B', { sourceType: SourceType.Record, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: 'src-b::nat-1', sourceName: 'Source B', sourceType: SourceType.Record } as any
        registry.register(account)
        expect([...registry.queryForSource('Source B')]).toHaveLength(0)
    })

    it('skip deferred-disabled account', () => {
        const sources = new Map()
        sources.set('Source C', { sourceType: SourceType.Authoritative, config: { deferredMatching: false } })
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: 'src-c::nat-1', sourceName: 'Source C', sourceType: SourceType.Authoritative } as any
        registry.register(account)
        expect([...registry.queryForSource('Source C')]).toHaveLength(0)
    })

    it('skip missing managedKey', () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: undefined, sourceName: 'Source A' } as any
        registry.register(account)
        expect([...registry.queryForSource('Source A')]).toHaveLength(0)
    })

    it('queryForSource returns only matching source candidates', () => {
        const sources = new Map()
        sources.set('A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        sources.set('B', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const fusionMap = new Map()
        const registry = makeRegistry({ sourcesByName: sources, fusionAccountMap: fusionMap })
        const accountA = { managedKey: 'src-a::nat-1', sourceName: 'A' } as any
        const accountB = { managedKey: 'src-b::nat-1', sourceName: 'B' } as any
        fusionMap.set('src-a::nat-1', accountA)
        fusionMap.set('src-b::nat-1', accountB)
        registry.register(accountA)
        registry.register(accountB)
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
        const registry = makeRegistry({ sourcesByName: sources, fusionAccountMap: fusionMap })
        registry.register(account)
        registry.clear()
        expect([...registry.queryForSource('A')]).toHaveLength(0)
    })
})
