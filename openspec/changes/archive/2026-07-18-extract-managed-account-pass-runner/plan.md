# Managed Account Pass Runner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `runUncorrelatedManagedAccountPass` into a `ManagedAccountPassRunner` with two-pass (parallel) design, extract `CandidateRegistry`, and eliminate duplicate analysis/dispatch code paths.

**Architecture:** `ManagedAccountPassRunner` receives a dependency-inverted state interface (following the existing `ManagedAccountAnalyzerState` pattern), executes a two-pass algorithm (Pass 1: identity scoring parallel batches → Pass 2: peer scoring parallel batches), and returns structured `ManagedAccountPassResult[]`. `CandidateRegistry` manages per-source candidate registration/query with no-op barrier. `FusionService` owns recording and dispatching from results.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

## Global Constraints

- All existing `fusionService.test.ts` tests must pass without modification to test logic (only mock updates for removed/added methods).
- `npm run typecheck` and `npm run lint` must remain clean.
- No API or configuration changes. No behavioral changes to matching, candidate visibility, or report generation.
- Follow the existing collaborator extraction pattern: narrow dependency interface, constructor injection, no reference to `FusionService` from extracted classes.

---

### Task 1: Create CandidateRegistry

**Files:**
- Create: `src/services/fusionService/candidateRegistry.ts`
- Test: `src/services/fusionService/__tests__/candidateRegistry.test.ts`

**Interfaces:**
- Produces: `CandidateRegistry` class, `CandidateRegistryDeps` interface

- [ ] **Step 1: Write the test file**

Create `src/services/fusionService/__tests__/candidateRegistry.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { CandidateRegistry, CandidateRegistryDeps } from '../candidateRegistry'
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
        const registry = makeRegistry({ sourcesByName: sources })
        const account = { managedKey: 'src-a::nat-1', sourceName: 'Source A', sourceType: SourceType.Authoritative } as any
        registry.register(account)
        const candidates = registry.queryForSource('Source A')
        expect([...candidates]).toHaveLength(1)
        expect([...candidates][0]).toBe(account)
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
        const account = { managedKey: 'src-a::nat-1', sourceName: 'A' } as any
        const registry = makeRegistry({ sourcesByName: sources })
        registry.register(account)
        registry.clear()
        expect([...registry.queryForSource('A')]).toHaveLength(0)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/fusionService/__tests__/candidateRegistry.test.ts`
Expected: FAIL — `CandidateRegistry` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/fusionService/candidateRegistry.ts`:

```typescript
import { AccountV2025 as Account } from 'sailpoint-api-client'
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/fusionService/__tests__/candidateRegistry.test.ts`
Expected: PASS (7 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/services/fusionService/candidateRegistry.ts src/services/fusionService/__tests__/candidateRegistry.test.ts
git commit -m "feat: extract CandidateRegistry for per-source deferred candidate management"
```

---

### Task 2: Create ManagedAccountPassRunner

**Files:**
- Create: `src/services/fusionService/managedAccountPassRunner.ts`
- Test: `src/services/fusionService/__tests__/managedAccountPassRunner.test.ts`

**Interfaces:**
- Consumes: `CandidateRegistry` (from Task 1), `ManagedAccountAnalyzer` (existing), `ManagedAccountAnalysisContext` (existing)
- Produces: `ManagedAccountPassResult` type, `ManagedAccountPassRunnerState` interface, `ManagedAccountPassRunner` class

- [ ] **Step 1: Write the test file**

Create `src/services/fusionService/__tests__/managedAccountPassRunner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ManagedAccountPassRunner, ManagedAccountPassRunnerState, ManagedAccountPassResult } from '../managedAccountPassRunner'
import { CandidateRegistry } from '../candidateRegistry'
import { SourceType } from '../../../model/config'

function makeRunner(overrides: Partial<ManagedAccountPassRunnerState> = {}): {
    runner: ManagedAccountPassRunner
    state: ManagedAccountPassRunnerState
    analyzeIdentityPhase: ReturnType<typeof vi.fn>
    analyzeDeferredPhase: ReturnType<typeof vi.fn>
    processAccount: ReturnType<typeof vi.fn>
    candidateRegistry: CandidateRegistry
} {
    const candidateRegistry = new CandidateRegistry({
        fusionAccountMap: new Map(),
        sourcesByName: new Map(),
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    })
    const analyzeIdentityPhase = vi.fn()
    const analyzeDeferredPhase = vi.fn()
    const processAccount = vi.fn()
    const state: ManagedAccountPassRunnerState = {
        config: { managedAccountsBatchSize: 10 } as any,
        log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        managedAccountAnalyzer: {
            analyzeIdentityPhase,
            analyzeDeferredPhase,
            isDeferredMatchingEnabledForSource: vi.fn().mockReturnValue(true),
        } as any,
        candidateRegistry,
        processAccount,
        ...overrides,
    }
    const runner = new ManagedAccountPassRunner(state)
    return { runner, state, analyzeIdentityPhase, analyzeDeferredPhase, processAccount, candidateRegistry }
}

function makeAccount(name: string, sourceName: string = 'Source A'): any {
    return { name, sourceName, id: `id-${name}`, nativeIdentity: `nat-${name}` }
}

describe('ManagedAccountPassRunner', () => {
    it('returns identity-match for matched account', async () => {
        const { runner, analyzeIdentityPhase } = makeRunner()
        const fusionAccount = { isMatch: true } as any
        analyzeIdentityPhase.mockResolvedValue({
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
        const { runner, analyzeIdentityPhase } = makeRunner()
        analyzeIdentityPhase.mockResolvedValue({
            account: { name: 'acct1', sourceName: 'Source A' },
            fusionAccount: { isMatch: false } as any,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 5,
            hasIdentityBackedMatches: false,
        })
        // Override to disable deferred matching
        ;(runner as any).state.managedAccountAnalyzer.isDeferredMatchingEnabledForSource.mockReturnValue(false)
        const results = await runner.execute([makeAccount('acct1')], 10, Date.now())
        expect(results).toHaveLength(1)
        expect(results[0].resolution).toBe('non-match')
    })

    it('queues deferred-pending and runs pass 2 for deferred-matched account', async () => {
        const sources = new Map()
        sources.set('Source A', { sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
        const candidateRegistry = new CandidateRegistry({
            fusionAccountMap: new Map(),
            sourcesByName: sources,
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        })
        const analyzeIdentityPhase = vi.fn()
        const analyzeDeferredPhase = vi.fn()
        const fusionAccount = {
            managedKey: 'src-a::nat-1',
            sourceName: 'Source A',
            isMatch: false,
            fusionMatches: [],
        } as any
        analyzeIdentityPhase.mockResolvedValue({
            account: { name: 'acct1', sourceName: 'Source A', sourceId: 'src-a', nativeIdentity: 'nat-1' },
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 5,
            hasIdentityBackedMatches: false,
        })
        // Pass 2: add a deferred match
        analyzeDeferredPhase.mockImplementation((analysis: any) => {
            analysis.fusionAccount.fusionMatches = [{ candidateType: 'NewUnmatched', identityName: 'peer', scores: [] }]
        })
        const runner = new ManagedAccountPassRunner({
            config: { managedAccountsBatchSize: 10 } as any,
            log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
            managedAccountAnalyzer: { analyzeIdentityPhase, analyzeDeferredPhase, isDeferredMatchingEnabledForSource: vi.fn().mockReturnValue(true) } as any,
            candidateRegistry,
            processAccount: vi.fn(),
        })
        const results = await runner.execute([makeAccount('acct1')], 10, Date.now())
        expect(results).toHaveLength(1)
        expect(results[0].resolution).toBe('deferred-match')
        expect(analyzeDeferredPhase).toHaveBeenCalledTimes(1)
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
        const analyzeIdentityPhase = vi.fn()
        const fusionAccount = {
            managedKey: 'src-a::nat-1',
            sourceName: 'Source A',
            isMatch: false,
            fusionMatches: [],
        } as any
        fusionMap.set('src-a::nat-1', fusionAccount)
        analyzeIdentityPhase.mockResolvedValue({
            account: { name: 'acct1', sourceName: 'Source A', sourceId: 'src-a', nativeIdentity: 'nat-1' },
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 5,
            hasIdentityBackedMatches: false,
        })
        const runner = new ManagedAccountPassRunner({
            config: { managedAccountsBatchSize: 10 } as any,
            log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
            managedAccountAnalyzer: { analyzeIdentityPhase, analyzeDeferredPhase: vi.fn(), isDeferredMatchingEnabledForSource: vi.fn().mockReturnValue(true) } as any,
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
        const { runner, analyzeIdentityPhase } = makeRunner()
        analyzeIdentityPhase.mockResolvedValue({
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
        // All identity match, no pass 2
        expect(results.every((r) => r.resolution === 'identity-match')).toBe(true)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/fusionService/__tests__/managedAccountPassRunner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/services/fusionService/managedAccountPassRunner.ts`:

```typescript
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { PhaseTimer } from '../logService'
import type { FusionConfig } from '../../model/config'
import type { LogService } from '../logService'
import type { ManagedAccountAnalyzer, ManagedAccountAnalysisContext } from './managedAccountAnalyzer'
import type { CandidateRegistry } from './candidateRegistry'
import { yieldToEventLoop } from './batching'
import { hasNewUnmatchedPeerMatches as checkHasNewUnmatchedPeerMatches } from './helpers'

export interface ManagedAccountPassRunnerState {
    readonly config: FusionConfig
    readonly log: LogService
    readonly managedAccountAnalyzer: ManagedAccountAnalyzer
    readonly candidateRegistry: CandidateRegistry
    processAccount(account: Account): Promise<any>
}

export type ManagedAccountPassResolution = 'identity-match' | 'deferred-match' | 'non-match'

export interface ManagedAccountPassResult {
    analysis: ManagedAccountAnalysisContext
    resolution: ManagedAccountPassResolution
}

interface PendingDeferred {
    analysis: ManagedAccountAnalysisContext
    account: Account
}

export class ManagedAccountPassRunner {
    constructor(private readonly state: ManagedAccountPassRunnerState) {}

    async execute(
        accounts: Account[],
        batchSize: number,
        managedAccountProcessingStartedAt: number
    ): Promise<ManagedAccountPassResult[]> {
        const initialQueueSize = accounts.length
        let processedCount = 0
        const results: ManagedAccountPassResult[] = []

        const logProgressEvery = Math.max(
            1,
            Math.min(batchSize, initialQueueSize)
        )

        const logProgress = (): void => {
            if (
                processedCount === 1 ||
                processedCount % logProgressEvery === 0 ||
                processedCount === initialQueueSize
            ) {
                this.state.log.info(
                    `Managed accounts progress: ${processedCount}/${initialQueueSize} analyzed | RUN ELAPSED ${PhaseTimer.formatElapsed(
                        Date.now() - managedAccountProcessingStartedAt
                    )}`
                )
            }
        }

        const hasDeferredMatching = (account: Account): boolean => {
            return this.state.managedAccountAnalyzer.isDeferredMatchingEnabledForSource(
                account.sourceName ?? undefined
            )
        }

        const pendingDeferred: PendingDeferred[] = []

        // Pass 1: identity scoring (parallel batches)
        for (let i = 0; i < accounts.length; i += batchSize) {
            const batch = accounts.slice(i, i + batchSize)
            const phaseAResults = await Promise.all(
                batch.map((account) =>
                    this.state.managedAccountAnalyzer.analyzeIdentityPhase(account)
                )
            )

            for (let j = 0; j < phaseAResults.length; j++) {
                const analysis = phaseAResults[j]
                const account = batch[j]
                processedCount++
                logProgress()

                if (analysis.hasIdentityBackedMatches) {
                    results.push({ analysis, resolution: 'identity-match' })
                } else if (hasDeferredMatching(account)) {
                    this.state.candidateRegistry.register(analysis.fusionAccount)
                    pendingDeferred.push({ analysis, account })
                } else {
                    results.push({ analysis, resolution: 'non-match' })
                }
            }
            await yieldToEventLoop()
        }

        // Pass 2: deferred peer scoring (parallel batches on pending)
        for (let i = 0; i < pendingDeferred.length; i += batchSize) {
            const batch = pendingDeferred.slice(i, i + batchSize)
            await Promise.all(
                batch.map(async (pending) => {
                    await this.state.managedAccountAnalyzer.analyzeDeferredPhase(pending.analysis)
                    if (checkHasNewUnmatchedPeerMatches(pending.analysis.fusionAccount)) {
                        results.push({ analysis: pending.analysis, resolution: 'deferred-match' })
                    } else {
                        results.push({ analysis: pending.analysis, resolution: 'non-match' })
                    }
                })
            )
            await yieldToEventLoop()
        }

        return results
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/fusionService/__tests__/managedAccountPassRunner.test.ts`
Expected: PASS (6 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/services/fusionService/managedAccountPassRunner.ts src/services/fusionService/__tests__/managedAccountPassRunner.test.ts
git commit -m "feat: extract ManagedAccountPassRunner with two-pass parallel design"
```

---

### Task 3: Integrate runner into FusionService

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/fusionService/__tests__/fusionService.test.ts`

**Interfaces:**
- Consumes: `ManagedAccountPassRunner` (from Task 2), `CandidateRegistry` (from Task 1)
- Removes: `analyzeManagedAccount`, `completeManagedAccountFromAnalysis`, `registerCurrentRunUnmatchedCandidate`, `currentRunUnmatchedCandidatesForSource`, `_currentRunUnmatchedCandidatesIterableForSource`, `deferredMatchingSourceKey`

- [ ] **Step 1: Add imports to fusionService.ts**

In `src/services/fusionService/fusionService.ts`, after line 45 (the `ManagedAccountAnalyzer` import), add:

```typescript
import { CandidateRegistry } from './candidateRegistry'
import { ManagedAccountPassRunner, ManagedAccountPassResult } from './managedAccountPassRunner'
```

- [ ] **Step 2: Add fields to FusionService class and constructor**

After line 62 (`private analysisRecorder`), add:

```typescript
    private candidateRegistry: CandidateRegistry
    private passRunner: ManagedAccountPassRunner
```

In the constructor, after line 139 (`this.managedAccountAnalyzer = new ManagedAccountAnalyzer(this)`), add:

```typescript
        this.candidateRegistry = new CandidateRegistry({
            fusionAccountMap: this._repository.fusionAccountMap,
            sourcesByName: this.sourcesByName,
            log: this.log,
        })
        this.passRunner = new ManagedAccountPassRunner({
            config: this.config,
            log: this.log,
            managedAccountAnalyzer: this.managedAccountAnalyzer,
            candidateRegistry: this.candidateRegistry,
            processAccount: (account: Account) => this.processManagedAccount(account),
        })
```

- [ ] **Step 3: In `initializeManagedAccountProcessing`, replace candidate clearing**

In `initializeManagedAccountProcessing` (around line 1612), replace:

```typescript
        this.currentRunUnmatchedFusionManagedKeysBySource.clear()
```

with:

```typescript
        this.candidateRegistry.clear()
```

- [ ] **Step 4: Replace `runUncorrelatedManagedAccountPass` body**

Replace lines 714-805 (`private async runUncorrelatedManagedAccountPass` through its closing brace) with:

```typescript
    private async runUncorrelatedManagedAccountPass(
        queuedAccounts: Account[],
        batchSize: number,
        managedAccountProcessingStartedAt: number
    ): Promise<number> {
        const results = await this.passRunner.execute(
            queuedAccounts,
            batchSize,
            managedAccountProcessingStartedAt
        )
        for (const result of results) {
            this.analysisRecorder.recordAnalysis(result.analysis)
            const { fusionAccount, account, sourceInfo, sourceType } = result.analysis
            switch (result.resolution) {
                case 'identity-match':
                    await this.handleIdentityBackedMatch(fusionAccount, account, sourceInfo)
                    break
                case 'deferred-match':
                    await this.handleDeferredMatch(fusionAccount, account)
                    break
                case 'non-match':
                    await this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
                    break
            }
        }
        return results.length
    }
```

- [ ] **Step 5: Modify `processManagedAccount` to use runner**

Replace lines 869-881 in `processManagedAccount` (the `analyzeManagedAccount` call and subsequent dispatch) with:

```typescript
        const results = await this.passRunner.execute(
            [account],
            1,
            Date.now()
        )
        if (results.length === 0) return undefined
        const result = results[0]
        this.analysisRecorder.recordAnalysis(result.analysis)
        const { fusionAccount, sourceInfo, sourceType } = result.analysis
        switch (result.resolution) {
            case 'identity-match':
                return this.handleIdentityBackedMatch(fusionAccount, account, sourceInfo)
            case 'deferred-match':
                return this.handleDeferredMatch(fusionAccount, account)
            case 'non-match':
                return this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
            default:
                return undefined
        }
```

Also remove the `/* istanbul ignore next */` comment and the `const identityBackedMatches` / `newUnmatchedPeerMatches` lines below.

- [ ] **Step 6: Remove obsolete private methods**

Remove these methods from `FusionService`:

- `analyzeManagedAccount` (lines 1087-1103) — replace all call sites with runner-based flow
- `completeManagedAccountFromAnalysis` (lines 1109-1136)
- `registerCurrentRunUnmatchedCandidate` (lines 1424-1432)
- `currentRunUnmatchedCandidatesForSource` (lines 1558-1560) — keep public interface but delegate to `candidateRegistry.queryForSource`
- `_currentRunUnmatchedCandidatesIterableForSource` (lines 1563-1570) — move logic to `CandidateRegistry`
- `deferredMatchingSourceKey` (lines 1434-1436)

For `currentRunUnmatchedCandidatesForSource`, update the public method to delegate:

```typescript
    public currentRunUnmatchedCandidatesForSource(sourceName: string | null | undefined): Iterable<FusionAccount> {
        return this.candidateRegistry.queryForSource(sourceName)
    }
```

- [ ] **Step 7: Update `finalizeAuthoritativeUnmatched`**

Lines 1414-1422: replace `this.registerCurrentRunUnmatchedCandidate(fusionAccount)` with:

```typescript
            this.candidateRegistry.register(fusionAccount)
```

Also update the `isDeferredMatchingEnabledForSource` check to use the candidateRegistry or managedAccountAnalyzer — the existing method still delegates to the analyzer.

- [ ] **Step 8: Update test mocks**

In `src/services/fusionService/__tests__/fusionService.test.ts`:

Search for `vi.spyOn(fusionService, 'analyzeManagedAccount')` — replace with spy on `passRunner.execute` returning a mock result.

Search for `vi.spyOn(fusionService as any, 'completeManagedAccountFromAnalysis')` — these should now be handled by the runner. Update spy to mock `passRunner.execute` returning expected results.

Search for references to `registerCurrentRunUnmatchedCandidate` or `deferredMatchingSourceKey` — update to use `candidateRegistry` equivalents.

Example mock update for the analyzeManagedAccount spy:
```typescript
    const executeSpy = vi.spyOn((fusionService as any).passRunner, 'execute').mockResolvedValue([])
```

And for tests that expected analyzeManagedAccount to produce results:
```typescript
    vi.spyOn((fusionService as any).passRunner, 'execute').mockResolvedValue([{
        analysis: {
            account: mockAccount,
            fusionAccount: mockFusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            fusionIdentityComparisons: 0,
            hasIdentityBackedMatches: true,
        },
        resolution: 'identity-match',
    }])
```

- [ ] **Step 9: Run existing tests to verify**

Run: `npx vitest run src/services/fusionService/__tests__/fusionService.test.ts`
Expected: May have failures — iterate on mock updates until all pass.

- [ ] **Step 10: Commit**

```bash
git add src/services/fusionService/fusionService.ts src/services/fusionService/__tests__/fusionService.test.ts
git commit -m "refactor: integrate ManagedAccountPassRunner into FusionService"
```

---

### Task 4: Verify and clean up

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 4: Remove stale directory**

```bash
rm -rf openspec/changes/2026-07-18-extract-managed-account-pass-runner
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: clean up old change directory, finalize ManagedAccountPassRunner integration"
```
