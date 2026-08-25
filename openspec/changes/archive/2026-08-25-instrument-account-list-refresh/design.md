## Context

Planned at git `866a683` (2026-08-25). Drift check (run first):

```bash
git diff --stat 866a683..HEAD -- \
  src/operations/helpers/accountListPhases.ts \
  src/services/fusionService/fusionService.ts \
  src/services/logService/operationRunContext.ts \
  src/services/logService/logService.ts \
  src/services/accountAssembly/accountAssembly.ts \
  src/services/definitionService/definitionService.ts \
  src/model/fusionLayers.ts
```

If excerpts below no longer match, STOP and refresh this design before apply.

### Refresh phase today

```195:203:src/operations/helpers/accountListPhases.ts
export async function refreshPhase(serviceRegistry: ServiceRegistry): Promise<void> {
    const { log, fusion } = serviceRegistry
    log.detail({ action: 'refreshing fusion accounts' })
    await fusion.ensureGlobalReviewerOwnersInScope()
    const refreshOp = log.track('refreshPhase.processFusionAccounts')
    const processedFusionAccounts = await fusion.processFusionAccounts()
    refreshOp.done({ count: processedFusionAccounts.length })
    log.detail({ action: 'refresh phase complete' })
}
```

Only one METRIC wraps the entire Refresh body. `recordRefreshedAccount()` increments a heartbeat counter when `needsRefresh` is true (`fusionService.ts:503-510`, `logService.ts:399-403`) but does not attribute time.

### `processFusionAccount` call chain (instrumentation targets)

```468:516:src/services/fusionService/fusionService.ts
    public async processFusionAccount(...): Promise<FusionAccount> {
        const fusionAccount = FusionAccount.fromFusionAccount(account)
        // ...
        this.applyReviewerLayersToFusionAccount(fusionAccount)           // prelude
        const mergeDecision = this.applyIdentityLayerForFusionAccount(...) // prelude
        await this.setOriginIdentityInScopeIfNeeded(...)                 // prelude (may API)
        await this.accountAssembly.addManagedAccountLayer(...)             // managedLayer
        await yieldToEventLoop()
        await this.definitionService.registerUniqueAttributes(...)         // uniqueRegister
        // needsRefresh flags
        await this.accountAssembly.applyAttributeProcessing(...)           // map + normalDefine
        await this.correlationManager.applyPerSourceCorrelationIfNeeded  // correlation
        this.finalizeProcessedFusionAccount(fusionAccount)                 // finalize
        return fusionAccount
    }
```

`applyAttributeProcessing` (`accountAssembly.ts:102-106`) calls `mapAttributes` then `refreshNormalAttributes` synchronously/async — split timing requires either:
- (preferred) lightweight timers inside `applyAttributeProcessing` that write to the same accumulator when a callback/deps hook is present, **or**
- separate timers wrapping `mapAttributes` and `refreshNormalAttributes` inside `FusionService` by inlining two calls instead of `applyAttributeProcessing` — **reject**; keep recipe in AccountAssembly and pass an optional `RefreshMetricsPort` through deps.

### Conventions the executor must match

- TypeScript strict; Prettier 120 / 4-space / single quotes / no semicolons (`AGENTS.md`)
- Tests: Vitest globals, `*.test.ts` under `__tests__/` (`openspec/specs/testing/spec.md`)
- Domain terms: Phase, Refresh, Map, Define, Fusion account, managed source account (`openspec/specs/ubiquitous-language/spec.md`)
- Do not pipe `npm test` to `tail` (`AGENTS.md`)
- Logging: DETAIL for operational milestones; METRIC for timed operations (`account-list-operation` operational milestones requirement)

### Vocabulary / spec constraints (do not re-litigate)

- Extended `processFusionAccount` recipe is spec-required (`fusion-service`: processFusionAccount composes extended account-assembly recipe)
- Unique generation remains Output JIT — do not time `refreshUniqueAttributes` here beyond registration
- Correlation-on-aggregation during Refresh is conditional (`correlationMode: correlate`); tenant under audit has `correlationMode: none` — still instrument the call (expect ~0ms)

## Goals / Non-Goals

**Goals:**

- Attribute Refresh wall time to named sub-steps with aggregate ms and workload counters
- Emit one grep-friendly summary line at Refresh phase end
- Keep overhead O(1) per account (integer adds, no string formatting per account)
- Unit-test accumulator reset, increment, and flush formatting

**Non-Goals:**

- Continuous profiling, flame graphs, or external APM integration
- Per-account METRIC or INFO lines
- Changing Refresh concurrency or Map/Define behavior
- HTML report phase-timing breakdown changes (may consume same data later)

## Decisions

### D1: Metrics live on `OperationRunContext`

Add `RefreshPhaseMetrics` with:
- `accountsProcessed: number`
- Per bucket: `{ totalMs: number, invocations: number }` for keys `prelude`, `managedLayer`, `uniqueRegister`, `map`, `normalDefine`, `correlation`, `finalize`
- Workload counters: `definitionsEvaluated`, `definitionsSkipped`, `managedAccountsBlended`, `queueEntriesScanned` (optional hook from FusionLayers when index package lands — stub counter at 0 until then)

Expose methods: `resetRefreshMetrics()`, `recordRefreshSubStep(bucket, ms, workload?)`, `flushRefreshMetricsSummary(): Record<string, unknown> | undefined`.

Only record when `this.phase === 'Refresh'`.

### D2: Timing helper

Add `src/utils/measureSync.ts` (or inline in fusionService):

```typescript
export function measureMs(fn: () => void | Promise<void>): Promise<number>
```

Use `performance.now()`. For async blocks, await then return delta.

### D3: AccountAssembly timing without forking recipe

Extend `AccountAssembly.applyAttributeProcessing` to accept optional `onSubStep?: (step: 'map' | 'normalDefine', ms: number) => void` in a new optional parameter object (second arg or options bag). `FusionService` passes callback that forwards to run context when phase is Refresh.

Alternative rejected: duplicate Map/Define calls in FusionService — violates single recipe seam.

### D4: Emission points

1. `refreshPhase`: call `log.runContext?.resetRefreshMetrics()` at start (after setting phase to Refresh if not already)
2. After `processFusionAccounts`: `const summary = log.flushRefreshMetricsSummary()`; if summary, `log.detail({ action: 'refresh workload', ...summary })`
3. Pass summary into `phaseEnd` detail via orchestration — **optional v1**: DETAIL alone is sufficient; if `runLoggedPhase` already calls `phaseEnd`, merge summary in `refreshPhase` by storing on log service for one tick, **or** return summary from `refreshPhase` and thread through orchestration. **Chosen:** emit DETAIL inside `refreshPhase`; also append flat keys to existing `flushPhaseCorrelationSummary()` merge in `accountListOrchestration` only if trivial — prefer DETAIL-only to minimize orchestration churn.

### D5: Queue scan counter (forward-compatible)

Add optional callback `onQueueScan?: (entriesExamined: number)` on `addManagedAccountLayer` options, invoked from `processPreviousRunMatchedAccounts` loop with `queue.size` today. Enables before/after proof for index package. Default no-op.

## Scope

**In scope:**

- `src/services/logService/operationRunContext.ts`
- `src/services/logService/logService.ts` (flush/reset passthrough)
- `src/services/fusionService/fusionService.ts`
- `src/services/accountAssembly/accountAssembly.ts`
- `src/services/accountAssembly/types.ts` (if options type extracted)
- `src/operations/helpers/accountListPhases.ts`
- `src/model/fusionLayers.ts` (queue scan callback only)
- Tests: `operationRunContext.test.ts`, new `refreshPhaseMetrics.test.ts`, extend `accountListPhaseInstrumentation.test.ts` or `fusionService` test

**Out of scope:**

- `getFusionParallelBatchSize` cap change
- Define refresh flag semantics
- Process/Output phase metrics
- connector-spec UI changes

## STOP conditions

- Drift: `processFusionAccount` no longer calls `applyAttributeProcessing` as a single recipe step without an approved spec change
- Per-account METRIC lines appear in implementation — reject and rework to aggregate only
- Instrumentation try/finally alters control flow (correlation errors swallowed)
- `npm test` or `npm run lint` fails twice after reasonable fix
- Overhead exceeds 5% on a local 100-account refresh smoke test — report and STOP (unlikely with integer counters)

## Git workflow

- Branch: applied on operator branch `2.2.0/preview` (ferspec local venue — no `openspec/<name>` or `perf/<name>` feature branch)
- Commits: `feat(log): add Refresh phase sub-step metrics` — conventional, match repo history
- Do not push unless asked

## Risks / Trade-offs

- `performance.now()` in hot path: acceptable; no allocation
- Origin scope API calls counted in `prelude` may dominate for identity-origin rows — that is signal, not noise
- Queue scan counter exposes O(n) behavior clearly — intentional for index package validation

## Maintenance notes

- When `index-refresh-managed-account-lookups` lands, compare `queueEntriesScanned` before/after on same tenant
- When `optimize-normal-definition-refresh` lands, compare `normalDefineMs` and `definitionsEvaluated` counts
- If HTML report needs Refresh breakdown, read flushed summary from run context in report epilogue (future)
