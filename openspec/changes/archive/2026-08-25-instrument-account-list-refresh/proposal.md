## Why

Refresh phase throughput (~20 Fusion accounts/s in production configs) is a reported bottleneck, but logs only show a single `METRIC refreshPhase.processFusionAccounts` line. Operators cannot tell whether CPU time is dominated by managed-account queue blending, Map, Normal Define (Velocity), unique registration locks, or correlation. Sub-step instrumentation is prerequisite to validating fixes in `index-refresh-managed-account-lookups` and `optimize-normal-definition-refresh`.

## What Changes

**Refresh sub-step metrics accumulator**
- From: No per-sub-step timing or workload counters during `processFusionAccount`
- To: `OperationRunContext` holds a `RefreshPhaseMetrics` struct (per-sub-step `count`, `totalMs`, and workload counters such as `definitionsEvaluated`, `queueScans`, `accountsBlended`)
- Reason: Enables evidence-based optimization without profiler attachment
- Impact: In-memory counters only; negligible overhead

**Instrumentation in `processFusionAccount`**
- From: Monolithic refresh with no internal timing
- To: Wrap each major block with `performance.now()` accumulation into the context metrics (prelude, managed layer, unique register, Map, Normal Define, correlation, finalize)
- Reason: Matches the extended refresh recipe in `fusion-service` spec
- Impact: Non-breaking; no behavior change

**Aggregate emission at Refresh phase end**
- From: `PHASE 3 Refresh END` shows correlation suffix only
- To: `refreshPhase` flushes metrics into one `DETAIL refresh workload` line and optional `phaseEnd` detail fields (`refreshMs=`, `managedLayerMs=`, `normalDefineMs=`, etc.)
- Reason: Operators grep one line to compare before/after optimization
- Impact: Logging only

**Unchanged**
- Fusion parallel batch size (cap 12)
- Map/Define/correlation semantics
- Heartbeat STATUS `progress=processed` during batch processing

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `account-list-operation`: Refresh phase emits aggregate workload summary
- `log-service`: Operation run context exposes Refresh-phase metrics accumulator
- `fusion-service`: `processFusionAccount` records sub-step metrics when run context phase is Refresh

## Impact

- **Code:** `src/services/logService/operationRunContext.ts`, `src/services/logService/logService.ts`, `src/services/fusionService/fusionService.ts`, `src/operations/helpers/accountListPhases.ts`, tests under `__tests__/`
- **Config / API:** None
- **Runtime behavior:** No functional change to aggregation output

## Apply status

- **Status**: done
- **Depends on**: none
- **Issue**:
