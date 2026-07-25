## Context

The account-list pipeline in `accountListPhases.ts` already emits `PHASE` and `STEP` boundaries for most Process and Output sub-steps via `LogService.stepStart` / `stepEnd`. Bottleneck analysis of a large tenant run (101k managed, 18k fusion accounts) found phase-level timers far exceeding the sum of logged steps.

Two uninstrumented calls sit on the critical path:

1. **Process phase** — `fusion.initializeManagedAccountProcessing()` (line ~239) builds the trigram index and linked-account key index before correlated/uncorrelated sweeps.
2. **Output phase** — `sources.clearManagedAccounts()` (line ~289) frees managed-account memory before form cleanup and send-accounts (non-record mode only).

Existing neighbors (`orphan-identity-hydration`, `correlated-sweep`, `form-cleanup`, `send-accounts`) already use STEP wrappers, establishing the pattern to follow.

## Goals / Non-Goals

**Goals:**
- Attribute wall time to managed-account initialization and cache clearing in operator logs
- Enable heartbeat STATUS to show active step during long init/clear operations
- Preserve zero behavioral change to pipeline logic

**Non-Goals:**
- Internal METRIC breakdown inside `initializeManagedAccountProcessing` (trigram vs linked-key)
- Optimizing index build or cache clear performance
- UID collision fixes, fetch concurrency tuning, or record-source refresh shortcuts (separate changes)
- Automated phase-sum reconciliation assertions

## Decisions

### D1: STEP wrappers at phase helper level (not inside services)

- **Choice:** Add `log.stepStart` / `log.stepEnd` in `processPhase` and `outputPhase` around the existing calls
- **Reason:** Matches all other step boundaries; single-file change; no service API churn
- **Considered alternatives:** METRIC inside `FusionService.initializeManagedAccountProcessing` — rejected as scope creep unless init dominates after clean re-profile

### D2: Canonical step names

- **Choice:** `managed-account-init` (Process), `clear-managed-accounts` (Output)
- **Reason:** Consistent kebab-case with `orphan-identity-hydration`, `record-unique-registration`, `send-accounts`
- **Considered alternatives:** `initialize-managed-account-processing` — rejected as overly long for STATUS lines

### D3: Record mode guard for clear step

- **Choice:** Emit `clear-managed-accounts` STEP only when `sources.clearManagedAccounts()` actually runs (`!sources.run.isRecordMode`)
- **Reason:** Avoid misleading 0ms STEP lines when cache is retained for recording
- **Considered alternatives:** Always log with `skipped: true` metadata — rejected; inconsistent with current pattern of not logging skipped work

### D4: Optional METRIC on init

- **Choice:** Use `log.track('FusionService.initializeManagedAccountProcessing')` inside the STEP wrapper (same pattern as `record-unique-registration`)
- **Reason:** Provides METRIC line for report phase-timing without duplicating instrumentation in FusionService
- **Considered alternatives:** STEP only — acceptable fallback if track adds noise; prefer both for parity

### D5: stepEnd metadata

- **Choice:** Include cheap counts on END where available without extra API calls (e.g. `remaining` managed accounts after clear, fusion account count after init if on `fusion.run`)
- **Reason:** Helps operators correlate duration with dataset size
- **Considered alternatives:** Duration-only END — acceptable minimum

## Risks / Trade-offs

- [Risk] STEP overhead on very fast runs → Mitigation: Negligible; existing steps already use same mechanism
- [Risk] Init step still opaque internally → Mitigation: Accept for v1; nested METRIC deferred per D1
- [Trade-off] Debugger-inflated timings may persist in dev profiles → Reason: Document re-profile without debugger in verify.md

## Migration Plan

N/A — logging-only change. Deploy with next connector release. No config migration or rollback beyond reverting the commit.

**Acceptance:** On a persistent accountList run, logs contain `STEP managed-account-init START/END` before `orphan-identity-hydration` and `STEP clear-managed-accounts START/END` before `form-cleanup` (non-record mode).

## Open Questions

- After no-debugger re-profile, does `managed-account-init` account for the full Process gap, or is debugger inflation the primary cause?
- Should `clear-managed-accounts` use `log.track()` METRIC as well, or STEP alone suffices given it is synchronous memory release?
