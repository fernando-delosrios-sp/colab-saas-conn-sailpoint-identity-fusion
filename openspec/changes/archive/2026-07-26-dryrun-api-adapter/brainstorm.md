# Brainstorm: Dry-run full accountList parity via API adapter

## Background

Dry-run mode (`std:account:list` with `{ dryRun: { enabled: true } }`) was consolidated into accountList in July 2026. The OpenSpec requires dry-run to stream 1-to-1 `StdAccountListOutput` rows via `res.send`, but the implementation skips Phase 5 output entirely (`outputPhase` returns 0 and clears fusion accounts before send). The epilogue sends only a terminal summary with `rowsSent: 0`.

Additionally, dry-run uses `isPersistentRun()` gates scattered across Match, Correlation, and phase helpers to **skip business logic** (auto-assign, review forms, correlation PATCH, orphan disable). This produces different in-memory FusionAccount state than a persistent aggregation, so even fixing output streaming would not achieve output parity.

The connector already has a record/replay API adapter stack in `ServiceRegistry`:
- **record**: `RecordingApiAdapter` wraps `SdkApiAdapter`, logs all calls
- **replay**: `ReplayApiAdapter` serves reads from log, returns recorded write responses without real calls

## Decision chain

**Q1: Should dry-run be a shorter/faster pipeline?**
No. User confirmed dry-run does not need to be shorter or more performant than regular accountList. It should run the same pipeline and produce the same `res.send` results.

**Q2: How do we inhibit tenant writes without skipping business logic?**
Introduce a **DryRunApiAdapter** at the client boundary (aligned with record/replay):
- Reads pass through to real ISC APIs
- Writes are inhibited (no inner call) and return synthetic responses so downstream code continues

**Q3: What about unique attributes and counters?**
Unique attributes must be processed during ISCAccount creation (JIT via `forEachISCAccount` + `refreshUniqueAttributes`). Incremental counters may advance **in-memory** during the run; tenant counters must not change (`saveState` / `patchSourceConfig` writes inhibited at adapter).

**Q4: Full output parity or unique-attr-only?**
Full parity. Dry-run output rows must match persistent aggregation rows for the same input state.

**Q5: Dry-run vs record mode?**
Mutually exclusive. Fail fast if `dryRun.enabled` and `recording.mode === 'record'` (or replay).

**Q6: How to test?**
Test the adapter boundary (reads delegate, writes suppressed), not dual full-pipeline mock comparisons. Optionally extend chain replay harness later.

## Approaches considered

### A. Keep isPersistentRun gates + fix output phase only
- Pros: Smallest diff
- Cons: Does not achieve full parity; maintains two behavioral pipelines

### B. DryRunApiAdapter + unified pipeline (chosen)
- Pros: One code path; write suppression centralized; mirrors existing record/replay pattern; business logic runs identically
- Cons: Requires credible synthetic responses for form/correlation/patch APIs

### C. Run persistent pipeline against replay log only
- Pros: Deterministic tests
- Cons: Dry-run against live tenant still needs live reads; replay is for test harness not production dry-run

## Design trade-offs

**Synthetic write responses**: Form creation and correlation assert on returned IDs. A shadow store with deterministic IDs (stable key hash, same idea as replay's `stableKey`) is required—not bare no-ops.

**aggregationMode: 'before'**: Persistent run may trigger managed-source aggregations before processing, changing fetched data. Dry-run with stubbed aggregation writes processes current tenant snapshots. Parity holds when both runs start from the same ISC data state—not when before-aggregation would refresh sources mid-run. Document, don't block.

**Reset flags**: Still exit early without applying reset (semantically wrong to simulate reset even with stubbed PATCH).

**Retire isPersistentRun for business logic**: Repurpose dry-run flag only for epilogue branching (HTML report vs aggregation report) or remove entirely if adapter handles all writes.

## Validated design summary

1. Extract shared write classification from `replayApiAdapter.ts`
2. Add `DryRunApiAdapter` wrapping `SdkApiAdapter`
3. `ServiceRegistry.activateDryRunMode()` at accountList entry; mutual exclusivity with record/replay
4. Remove output phase early exit; run `forEachISCAccount` + `res.send` for dry-run
5. Remove `isPersistentRun` skips in MatchOutcomeDispatcher, CorrelationManager, phase helpers
6. Adapter inhibits all ISC writes; in-memory state evolves identically to persistent run
7. Terminal summary remains final `res.send`; optional HTML/email before summary
