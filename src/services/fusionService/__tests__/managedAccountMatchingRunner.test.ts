import { describe, it, expect, vi } from 'vitest'
import { ManagedAccountMatchingRunner, ManagedAccountMatchingRunnerState } from '../managedAccountMatchingRunner'
import { CandidateRegistry } from '../candidateRegistry'
import { SourceType } from '../../../model/config'

function makeRunner(overrides: Partial<ManagedAccountMatchingRunnerState> = {}): {
    runner: ManagedAccountMatchingRunner
    state: ManagedAccountMatchingRunnerState
    scoreIdentityCandidates: ReturnType<typeof vi.fn>
    scoreDeferredCandidates: ReturnType<typeof vi.fn>
    processAccount: ReturnType<typeof vi.fn>
    candidateRegistry: CandidateRegistry
} {
    const candidateRegistry = new CandidateRegistry({
        fusionAccountMap: new Map(),
        sourcesByName: new Map(),
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    })
    const scoreIdentityCandidates = vi.fn()
    const scoreDeferredCandidates = vi.fn()
    const processAccount = vi.fn()
    const state: ManagedAccountMatchingRunnerState = {
        config: { managedAccountsBatchSize: 10 } as any,
        log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        managedAccountAnalyzer: {
            scoreIdentityCandidates,
            scoreDeferredCandidates,
            isDeferredMatchingEnabledForSource: vi.fn().mockReturnValue(true),
        } as any,
        candidateRegistry,
        processAccount,
        ...overrides,
    }
    const runner = new ManagedAccountMatchingRunner(state)
    return { runner, state, scoreIdentityCandidates, scoreDeferredCandidates, processAccount, candidateRegistry }
}

function makeAccount(name: string, sourceName: string = 'Source A'): any {
    return { name, sourceName, id: `id-${name}`, nativeIdentity: `nat-${name}` }
}

describe('ManagedAccountMatchingRunner', () => {
    it('returns identity-match for matched account', async () => {
        const { runner, scoreIdentityCandidates } = makeRunner()
        const fusionAccount = { isMatch: true } as any
        scoreIdentityCandidates.mockResolvedValue({
            account: { name: 'acct1', sourceName: 'Source A' },
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 5,
            hasIdentityBackedMatches: true,
        })
        const results = await runner.execute([makeAccount('acct1')], 10, Date.now())
        expect(results).toHaveLength(1)
        expect(results[0].resolution).toBe('identity-match')
        expect(results[0].analysis.hasIdentityBackedMatches).toBe(true)
    })

    it('returns non-match for non-deferred unmatched account', async () => {
        const { runner, scoreIdentityCandidates } = makeRunner()
        scoreIdentityCandidates.mockResolvedValue({
            account: { name: 'acct1', sourceName: 'Source A' },
            fusionAccount: { isMatch: false } as any,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 5,
            hasIdentityBackedMatches: false,
        })
        ;(runner as any).state.managedAccountAnalyzer.isDeferredMatchingEnabledForSource.mockReturnValue(false)
        const results = await runner.execute([makeAccount('acct1')], 10, Date.now())
        expect(results).toHaveLength(1)
        expect(results[0].resolution).toBe('non-match')
    })

    it('queues deferred-pending and runs pass 2 for deferred-matched account', async () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const fusionMap = new Map()
        const candidateRegistry = new CandidateRegistry({
            fusionAccountMap: fusionMap,
            sourcesByName: sources,
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        })
        const scoreIdentityCandidates = vi.fn()
        const scoreDeferredCandidates = vi.fn()
        const fusionAccount = {
            managedKey: 'src-a::nat-1',
            sourceName: 'Source A',
            isMatch: false,
            fusionMatches: [],
        } as any
        fusionMap.set('src-a::nat-1', fusionAccount)
        scoreIdentityCandidates.mockResolvedValue({
            account: { name: 'acct1', sourceName: 'Source A', sourceId: 'src-a', nativeIdentity: 'nat-1' },
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 5,
            hasIdentityBackedMatches: false,
        })
        scoreDeferredCandidates.mockImplementation((analysis: any) => {
            analysis.fusionAccount.fusionMatches = [{ candidateType: 'deferred', identityName: 'peer', scores: [] }]
        })
        const runner = new ManagedAccountMatchingRunner({
            config: { managedAccountsBatchSize: 10 } as any,
            log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
            managedAccountAnalyzer: { scoreIdentityCandidates, scoreDeferredCandidates, isDeferredMatchingEnabledForSource: vi.fn().mockReturnValue(true) } as any,
            candidateRegistry,
            processAccount: vi.fn(),
        })
        const results = await runner.execute([makeAccount('acct1')], 10, Date.now())
        expect(results).toHaveLength(1)
        expect(results[0].resolution).toBe('deferred-match')
        expect(scoreDeferredCandidates).toHaveBeenCalledTimes(1)
    })

    it('registers candidate in pass 1 for deferred-pending accounts', async () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const fusionMap = new Map()
        const candidateRegistry = new CandidateRegistry({
            fusionAccountMap: fusionMap,
            sourcesByName: sources,
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        })
        const scoreIdentityCandidates = vi.fn()
        const fusionAccount = {
            managedKey: 'src-a::nat-1',
            sourceName: 'Source A',
            isMatch: false,
            fusionMatches: [],
        } as any
        fusionMap.set('src-a::nat-1', fusionAccount)
        scoreIdentityCandidates.mockResolvedValue({
            account: { name: 'acct1', sourceName: 'Source A', sourceId: 'src-a', nativeIdentity: 'nat-1' },
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 5,
            hasIdentityBackedMatches: false,
        })
        const runner = new ManagedAccountMatchingRunner({
            config: { managedAccountsBatchSize: 10 } as any,
            log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
            managedAccountAnalyzer: { scoreIdentityCandidates, scoreDeferredCandidates: vi.fn(), isDeferredMatchingEnabledForSource: vi.fn().mockReturnValue(true) } as any,
            candidateRegistry,
            processAccount: vi.fn(),
        })
        await runner.execute([makeAccount('acct1')], 10, Date.now())
        expect([...candidateRegistry.queryForSource('Source A')]).toHaveLength(1)
    })

    it('handles empty input', async () => {
        const { runner } = makeRunner()
        const results = await runner.execute([], 10, Date.now())
        expect(results).toHaveLength(0)
    })

    it('respects batch boundaries', async () => {
        const { runner, scoreIdentityCandidates } = makeRunner()
        scoreIdentityCandidates.mockResolvedValue({
            account: { name: 'acct', sourceName: 'Source A' },
            fusionAccount: { isMatch: true } as any,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 1,
            hasIdentityBackedMatches: true,
        })
        const accounts = Array.from({ length: 5 }, (_, i) => makeAccount(`acct${i}`))
        const results = await runner.execute(accounts, 2, Date.now())
        expect(results).toHaveLength(5)
        expect(results.every((r) => r.resolution === 'identity-match')).toBe(true)
    })
})
