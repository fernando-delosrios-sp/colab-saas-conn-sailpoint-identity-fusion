## Why

Dry-run mode was specified to stream the same `StdAccountListOutput` rows as a persistent aggregation, but the implementation skips Phase 5 output and uses `isPersistentRun()` gates that skip Match and Correlation business logic. Operators cannot preview the exact accounts ISC would receive—including JIT unique attributes—without mutating the tenant. The connector already has record/replay API adapters; extending that pattern to inhibit writes while running the full pipeline is the natural fix.

## What Changes

**Dry-run runs the full accountList pipeline**
- From: Dry-run skips account streaming, auto-assign, form creation, correlation PATCH, and other logic via `isPersistentRun()` gates; epilogue sends summary with `rowsSent: 0`.
- To: Dry-run executes the same phases and business logic as persistent aggregation; streams accounts via `res.send`; terminal summary remains the final send.
- Reason: Operators need byte-identical output preview without tenant mutation.
- Impact: Non-breaking for input contract; behavior change for dry-run consumers expecting summary-only output.

**Write suppression via DryRunApiAdapter**
- From: Write side effects suppressed by skipping code paths (`isPersistentRun()` checks in Match, Correlation, phase helpers).
- To: All ISC API reads pass through; writes inhibited at the client adapter with synthetic responses (same layer as `RecordingApiAdapter` / `ReplayApiAdapter`).
- Reason: One pipeline, centralized write boundary, full in-memory state parity.
- Impact: Internal refactor; new adapter module and shared write classification.

**Counter semantics clarified**
- From: Ambiguous whether in-memory counter advancement is allowed during dry-run.
- To: Incremental unique-attribute counters may advance in-memory during the run; tenant persistence (`patchSourceConfig` for fusion state / batch counts) is inhibited at the adapter.
- Reason: Output must reflect counter-based unique values; tenant must remain unchanged.
- Impact: Spec clarification only.

**Dry-run and record mode are mutually exclusive**
- From: No explicit guard against combining `dryRun.enabled` with `recording.mode: record` or `replay`.
- To: Operation fails fast with a clear error when both are active.
- Reason: Record/replay and dry-run serve different purposes and must not compose.
- Impact: Non-breaking; previously undefined combination now rejected.

## Capabilities

### New Capabilities

_(none — all changes fit existing capability specs)_

### Modified Capabilities

- `account-list-operation`: Full pipeline execution in dry-run; account streaming via `res.send`; adapter-based write suppression; dry-run/record mutual exclusion; counter in-memory simulation allowed.
- `client-service`: DryRunApiAdapter write inhibition, synthetic response shadow store, shared write-method classification with replay adapter.
- `fusion-service`: Split JIT unique-attribute scenario—account read vs dry-run accountList (dry-run may simulate counters in-memory for output; account read must not).

## Impact

**Code:**
- Added: `dryRunApiAdapter.ts`, `apiWriteClassification.ts`, `DryRunApiAdapter` unit tests
- Modified: `serviceRegistry.ts`, `accountList.ts`, `accountListPhases.ts`, `matchOutcomeDispatcher.ts`, `correlationManager.ts`, `fusionService.ts` (remove or repurpose `isPersistentRun`)
- Docs: `docs/operations/dry-run.md` (remove rowsSent=0, update flow)

**Tests:**
- Modified: `accountList.test.ts` dry-run scenarios
- Added: adapter unit tests, write-suppression integration tests

**Spec files:**
- Modified: `openspec/specs/account-list-operation/spec.md`, `openspec/specs/fusion-service/spec.md`
- Modified: `openspec/specs/client-service/spec.md`
