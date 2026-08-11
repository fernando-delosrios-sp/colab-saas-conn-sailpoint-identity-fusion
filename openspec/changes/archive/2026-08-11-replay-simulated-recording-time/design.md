## Context

Scenario recording captures ISC API traffic and operation goldens under `recordings/<tenant>/<scenario>/`. Replay runs the production pipeline with `ReplayApiAdapter` serving recorded responses. Step boundaries align API cursors via `ReplayApiAdapter.seekBefore(stepTimestamp)` using timestamps from `steps.ndjson`.

Form fetch during `accountList` calls `fetchFormInstances({ staleFormCleanup: isPersistent })`. When cleanup is enabled, `partitionStaleForms` drops definitions older than `fusionFormExpirationDays` relative to **`Date.now()`**. A recording captured on 2026-07-31 replayed on 2026-08-11 treats all forms as expired (11 days > 7-day window), yielding zero form instances, zero fusion identity decisions, and step-23 golden drift.

Stakeholders: developers running `npm run test-recording`, CI optional recording verification, and interactive `npm run replay`.

## Goals / Non-Goals

**Goals:**

- Replay evaluates time-sensitive logic at each step's **recorded timestamp**, not wall clock.
- Fix false drift on aged recordings (e.g. `company12926-poc/fernando` step-23) without re-recording.
- Keep production aggregation behavior unchanged when simulated time is unset.
- Wire simulated time in both in-process harness and spawned replay CLI.

**Non-Goals:**

- Changing `fusionFormExpirationDays` semantics in production.
- Disabling stale form cleanup during replay (workaround, not correct simulation).
- Global `Date` mocking across the entire Node process.
- Re-recording existing scenarios as part of this change.
- Relaxing step-23 golden comparison rules.

## Decisions

### D1: Run-scoped clock on FusionRun

- **Choice:** Add optional `simulatedTimeMs` on `FusionRun` with `setSimulatedTime(isoOrMs)` / `clearSimulatedTime()` and `currentTimeMs(): number` returning simulated value when set, else `Date.now()`.
- **Reason:** Minimal surface; follows existing pattern of run-scoped replay state; accessible to `FormLifecycle` via existing `FusionRun` dep.
- **Considered alternatives:** AsyncLocalStorage (heavier, harder to test); disable stale cleanup in replay (masks logic); global Date patch (fragile in Vitest).

### D2: Timestamp source per step

- **Choice:** Use `steps.ndjson` per-step `timestamp` when present; fall back to `scenario.recordedAt`; if still missing, fall back to wall clock and log a one-line warning.
- **Reason:** Matches existing `seekBefore` alignment; coarse session time insufficient for multi-step chains.
- **Considered alternatives:** `recordedAt` only (wrong for step 23 vs step 1); infer from next api-log entry (implicit, brittle).

### D3: Set/clear lifecycle in replay harness

- **Choice:** At step start (after `seekBefore`), set simulated time on the operation's `FusionRun`. Clear in a `finally` block after step completes (in-process). CLI passes timestamp via env/header consumed by connector bootstrap for that step.
- **Reason:** Prevents simulated time leaking across Vitest tests or sequential steps with different timestamps.
- **Considered alternatives:** Set once per scenario (wrong for multi-hour chains).

### D4: Form stale check uses run clock

- **Choice:** Replace `Date.now()` in `FormLifecycle.isFormDefinitionStale` with `this.deps.run.currentTimeMs()`.
- **Reason:** Direct fix validated by investigation; single call site today.
- **Considered alternatives:** Parameter injection through `FormFetchOptions` (duplicates run state).

### D5: Audit scope for other age checks

- **Choice:** Grep for replay-sensitive `Date.now()` in form and aggregation paths; fix any that affect replay output in the same change. Document "none found" in tasks if audit is clean.
- **Reason:** Avoid fixing one call site while leaving identical drift elsewhere.
- **Considered alternatives:** Form-only fix without audit (risk of partial fix).

## Risks / Trade-offs

- **[Risk] Simulated time not wired in one replay entry point** → Mitigation: spec scenarios for harness + CLI; integration test with backdated fixture.
- **[Risk] Leaked simulated time between tests** → Mitigation: clear in `finally`; FusionRun per operation instance.
- **[Risk] Missing step timestamp falls back to wall clock** → Mitigation: warn in log; document in scenario-recording guide.
- **[Trade-off] Run clock not used in record/live modes** → Accepted: only replay needs simulation; production keeps real-time stale cleanup.

## Migration Plan

N/A — library/connector behavior change only. No deployment migration.

**Rollout:**

1. Implement FusionRun clock + form stale change with unit tests.
2. Wire ScenarioRunner / replay CLI.
3. Verify `npm test` + targeted replay tests.
4. Optional manual: `VERIFY_RECORDING_SCENARIO=company12926-poc/fernando npm test` when local recording exists.

**Rollback:** Revert commit; replay of old recordings reverts to wall-clock stale behavior.

## Open Questions

- None blocking. CLI wiring detail (env var name vs request header) left to implementer — prefer reusing existing replay config channel if one exists.
