## Context

Dry-run mode runs on `std:account:list` via `{ dryRun: { enabled: true } }` for out-of-platform analysis. OpenSpec requires 1-to-1 `StdAccountListOutput` streaming, but [`accountListPhases.ts`](../../../src/operations/helpers/accountListPhases.ts) exits output early when `!isPersistent`, and [`matchOutcomeDispatcher.ts`](../../../src/services/matchingService/matchOutcomeDispatcher.ts) / [`correlationManager.ts`](../../../src/services/correlationManager.ts) skip business logic when `!isPersistentRun()`.

The connector already wraps the SDK client in [`ServiceRegistry`](../../../src/services/serviceRegistry.ts):
- `RecordingApiAdapter` — logs all API calls during record mode
- `ReplayApiAdapter` — serves reads from log, returns recorded write responses without real calls

All ISC mutations flow through `ClientService` → `SourceService.patchSourceConfig`, `IdentityService.correlateAccounts`, `FormService.createForm*`, etc.

## Goals / Non-Goals

**Goals:**
- Dry-run produces the same `res.send(account)` stream as persistent aggregation for the same ISC input state
- JIT unique attributes processed during output (`forEachISCAccount` with `refreshUniqueAttributes: true`)
- Zero tenant mutations: all write API calls inhibited at adapter boundary
- In-memory counter simulation allowed; tenant counters unchanged after run
- Reject `dryRun.enabled` combined with record or replay mode

**Non-Goals:**
- Making dry-run faster or skipping phases
- Supporting dry-run + record mode simultaneously
- Guaranteeing parity when `aggregationMode: 'before'` would refresh managed sources mid-run (different input snapshots)
- Simulating reset flags (`resetAccounts` / `resetForms`) — still exit early without applying

## Decisions

### D1: Write suppression at API adapter, not business-logic gates

- **Choice**: Introduce `DryRunApiAdapter` wrapping `SdkApiAdapter`; remove `isPersistentRun()` skips from Match, Correlation, and phase helpers.
- **Reason**: One pipeline, centralized boundary, mirrors record/replay; skipping logic prevents full output parity.
- **Considered alternatives**: Fix output phase only (rejected—insufficient for match/form/correlation parity); keep gates and simulate state manually (rejected—duplicate pipeline).

### D2: Shared write classification with replay

- **Choice**: Extract `isWriteMethod()` from [`replayApiAdapter.ts`](../../../src/services/clientService/replayApiAdapter.ts) into shared module used by Replay and DryRun adapters.
- **Reason**: Single source of truth for inhibit-vs-pass-through.
- **Considered alternatives**: Duplicate lists per adapter (rejected—drift risk).

### D3: Synthetic write responses via shadow store

- **Choice**: DryRun adapter returns shape-valid synthetic responses (deterministic IDs from stable call keys) for form creation, account PATCH, source config PATCH, deletes.
- **Reason**: Callers assert on returned IDs (`formInstance.id`, etc.); bare no-ops break the pipeline.
- **Considered alternatives**: Return empty objects (rejected—assertions fail); call real API (rejected—tenant mutation).

### D4: Activate adapter at accountList entry

- **Choice**: `ServiceRegistry.activateDryRunMode()` called at start of [`accountList.ts`](../../../src/operations/accountList.ts) after parsing input, before any phase API calls.
- **Reason**: Registry is constructed before input is available in [`operationHandler.ts`](../../../src/utils/operationHandler.ts).
- **Considered alternatives**: Parse dryRun in operationHandler (rejected—couples all operations to dry-run input).

### D5: Epilogue-only dry-run branching

- **Choice**: Keep dry-run-specific epilogue (HTML/email report + terminal summary); remove persistence branching from process/output logic.
- **Reason**: Report delivery differs; pipeline body should not.
- **Considered alternatives**: Retain `isPersistent` throughout phases (rejected—conflates output policy with write policy).

### D6: Counter semantics

- **Choice**: `initializeCounters()` reads tenant state; incremental counters advance in-memory during Process and Output (`forEachISCAccount` with JIT refresh). Dry-run skips the persistent output tail (`saveState`, `saveBatchCumulativeCount`, form cleanup, delayed scheduling) so no counter PATCH reaches the tenant; projected values still appear in streamed accounts.
- **Reason**: Output must show projected counter-based unique values; tenant must not change. Skipping the persistent tail is simpler than running save paths with adapter inhibition and matches epilogue-only dry-run branching.
- **Considered alternatives**: Run `saveState` with PATCH inhibited at adapter (rejected—redundant when tail is dry-run-only); freeze counters entirely (rejected—wrong output for new accounts).

## Risks / Trade-offs

- [Risk] Synthetic responses missing fields for edge API paths → Mitigation: unit tests per critical write path (forms, correlate, patchSourceConfig); extend shadow store as failures surface.
- [Risk] Hidden writes bypassing `ClientService` → Mitigation: grep audit for direct SDK usage; adapter tests with RecordingApiAdapter on inner.
- [Trade-off] `aggregationMode: 'before'` parity only when both runs share same pre-aggregation snapshot → Accepted; document in dry-run.md.
- [Trade-off] Removing logic gates increases dry-run work (forms, correlation code paths run) → Accepted; user explicitly rejected shorter dry-run.

## Migration Plan

1. Ship adapter + pipeline unification behind existing `dryRun.enabled` input (no input contract change).
2. Update `docs/operations/dry-run.md`: Phase 5 streams accounts; `rowsSent` reflects actual sends.
3. Consumers that relied on summary-only dry-run (no account rows) must parse account `res.send` payloads again.
4. Rollback: revert adapter activation and restore `isPersistentRun` gates if critical regression.

**Acceptance:** `npm test` passes; dry-run integration test asserts account `res.send` calls and zero inner write delegation; tenant PATCH mocks not called.

## Open Questions

- None blocking implementation. Shadow-store response shapes may need iteration as edge API paths are discovered in testing.
