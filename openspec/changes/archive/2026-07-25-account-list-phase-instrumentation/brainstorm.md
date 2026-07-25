# Brainstorm — Account List Phase Instrumentation

## Context

Analysis of `debug-messages-20260725.log` (14m 58s accountList run) found ~133s unaccounted in the Process phase (2m 36s reported vs ~23s logged steps) and a possible ~22s gap in Output phase (31.5s vs 8.9s `send-accounts`).

Two calls in `accountListPhases.ts` lack `STEP`/`METRIC` wrappers:
- `fusion.initializeManagedAccountProcessing()` — builds trigram index + linked-account key index before correlated sweep
- `sources.clearManagedAccounts()` — memory cleanup at Output phase start

Debugger was attached during the profiled run, inflating step timers (e.g. 8.2s correlated sweep with zero correlated accounts).

## Decision chain

**Q1: What problem are we solving?**
Observability gap — phase timers show large unaccounted time; cannot distinguish real work from debugger overhead or hidden init/cleanup.

**Q2: Scope — instrumentation only or also optimization?**
Instrumentation only. No behavioral changes to matching, indexing, or cache clearing. Optimization (Bottlenecks 1–2, 4–5) is out of scope for this change.

**Q3: Which steps to wrap?**
Two confirmed gaps:
1. `managed-account-init` around `initializeManagedAccountProcessing()` in `processPhase`
2. `clear-managed-accounts` around `sources.clearManagedAccounts()` in `outputPhase`

**Q4: STEP vs METRIC?**
Follow existing pattern: `log.stepStart` / `log.stepEnd` for phase-visible steps; optional `log.track()` for nested METRIC (consistent with `record-unique-registration`). Primary deliverable is STEP wrappers; METRIC on init is optional if `initializeManagedAccountProcessing` is a single opaque call.

**Q5: Re-profile without debugger?**
Verification step, not code change. Document in verify.md: re-run with `npm run dev` (no debugger) on same dataset to validate whether Process phase is truly ~2.5m or ~25s.

## Approaches considered

| Approach | Pros | Cons |
|----------|------|------|
| **A. STEP wrappers only (recommended)** | Minimal diff, matches existing conventions, closes attribution gap | Does not break down trigram vs linked-key index internally |
| B. Nested METRIC inside `initializeManagedAccountProcessing` | Finer-grained visibility | Touches fusion/matching services; scope creep |
| C. Phase-level assertion that step sum ≈ phase timer | Catches future gaps automatically | New infra; overkill for two known holes |

**Recommendation:** Approach A. Revisit B only if `managed-account-init` dominates Process phase after clean re-profile.

## Design trade-offs

- **Naming:** kebab-case step IDs (`managed-account-init`, `clear-managed-accounts`) aligned with existing steps (`correlated-sweep`, `send-accounts`).
- **Metadata on stepEnd:** Include counts where cheap — e.g. fusion identity count / managed account count if available from serviceRegistry without extra API calls.
- **Record mode:** `clearManagedAccounts` is skipped when `isRecordMode`; step wrapper should only run when the call runs (avoid logging 0ms no-ops).

## Success criteria

1. Process and Output phase logs show new STEP lines with durations.
2. Sum of logged Process steps + new init step accounts for most of Process phase wall time on a no-debugger run.
3. No functional change to accountList behavior; tests pass.
