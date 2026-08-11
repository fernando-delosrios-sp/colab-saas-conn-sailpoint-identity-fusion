# Brainstorm: Replay simulated recording time

## Background

Scenario replay (`npm run test-recording`, Vitest `verifyScenarioRecording`, `npm run replay`) runs the real connector pipeline against recorded `api-log.ndjson` goldens. Drift on `company12926-poc/fernando` is isolated to **step-23** (final `accountList`, sweep 23): 7 drift lines, 25 vs 26 accounts.

Investigation showed replay **does** fetch 11 form definitions from the API log during step-23, then **discards all of them** as stale:

```
Form definition f97b452d-... is older than 7 day(s), queuing deletion
fusion-reviews=0 fusion-review-instances=0
processing fusion identity decisions count=0
```

Root mechanism:

- Recording captured **2026-07-31**; replay runs on **2026-08-11** (~11 days later).
- Config `fusionFormExpirationDays: 7`.
- `FormLifecycle.isFormDefinitionStale()` uses **`Date.now()`** (wall clock), not the recorded step timestamp.
- Replay runs with `isPersistent: true` → `staleFormCleanup: true` in fetch phase.
- Downstream effects: no finished review decisions (no NG000026 Brian Irons), no Sergei merge on NG000009, empty review URLs on NG000025.

This is a **time-sensitivity bug in offline replay**, not primarily a golden/API mismatch. Mid-chain accountList steps mask some differences via relaxed compare rules; step-23 uses strict comparison.

## Q1: What scope should simulated time cover?

**Options:**

- **A — Replay-only clock injection** — Only scenario replay / verification harness sets a simulated “now” per step from `steps.ndjson` timestamps. Production aggregation unchanged.
- **B — Global clock abstraction everywhere** — Introduce injectable clock used by FormService and all time-dependent code paths.
- **C — Disable stale cleanup during replay** — Pass `staleFormCleanup: false` when `ReplayApiAdapter` is active.

**Decision: A (recommended)** with a narrow shared primitive.

- Matches user intent: “replay should simulate recording time.”
- Smaller blast radius than B; more correct than C (C hides stale logic entirely rather than evaluating it at recorded time).
- C remains a fallback if clock injection proves hard to wire.

## Q2: Where should the simulated timestamp come from?

**Options:**

- Per-step `steps.ndjson` `timestamp` (already loaded by `ScenarioRunner.loadStepTimestamps`).
- `scenario.json` `recordedAt` (single session anchor — too coarse for multi-step chains).
- Per api-log entry cursor time (implicit, harder to reason about).

**Decision: Per-step timestamp from `steps.ndjson`**, falling back to `scenario.recordedAt` when a step lacks a timestamp.

## Q3: How should code read “now” during replay?

**Options:**

- **AsyncLocalStorage / run context** on `FusionRun` or `ServiceRegistry` (`run.simulatedNowMs`).
- Thread through `FormLifecycle` deps as `now: () => number`.
- Vitest/mock `Date.now` in harness only (fragile, affects unrelated code in same process).

**Decision: Run-scoped clock on `FusionRun` (or operation run context already used by logging).**

- `FormLifecycle.isFormDefinitionStale` and any other replay-sensitive age checks read `run.currentTimeMs()` which returns simulated time when set, else `Date.now()`.
- Scenario replay harness sets simulated time at start of each step (alongside existing `replayAdapter.seekBefore(stepTimestamp)`).
- CLI replay (`proxy-server` path) sets simulated time from the same step metadata when feeding steps.

## Q4: Which behaviors must use simulated time?

**Minimum (this change):**

- Form definition stale partition (`isFormDefinitionStale` / `partitionStaleForms`).

**Audit (same change, if trivial):**

- Form instance expiry comparisons if any use wall clock.
- History date formatting is already normalized in compare — out of scope unless found to affect replay logic.

**Explicitly out of scope:**

- Changing `fusionFormExpirationDays` semantics in production.
- Re-recording `fernando` (valid workaround, not a fix).
- Relaxing step-23 golden comparison rules.

## Q3b: Production safety

Simulated time MUST NOT leak outside replay/record verification:

- Set only when replay mode is active (`ReplayApiAdapter` wired or explicit replay flag on run).
- Cleared/restored after each step in harness to avoid polluting other tests.

## Approaches compared

| Approach | Pros | Cons |
|----------|------|------|
| **A: Run-scoped simulated now** | Correct semantics; small surface; tests real stale logic at recorded date | Requires plumbing one accessor |
| **B: Global Date abstraction** | Uniform | Large refactor; easy to miss call sites |
| **C: Disable stale cleanup in replay** | One-line behavioral skip | Masks stale-form path; diverges from recorded run |

**Recommendation: A.**

## Success criteria

1. `npm run test-recording -- "company12926-poc/fernando"` passes without re-recording (given existing local artifacts).
2. Vitest `verifyRecording.cli.test.ts` passes when `VERIFY_RECORDING_SCENARIO=company12926-poc/fernando`.
3. Step-23 replay logs show `fusion-reviews > 0`, `fusion identity decisions count > 0` when forms existed at recording time.
4. Production behavior unchanged when simulated time is unset (wall clock).
5. Unit test: form created 10 days before simulated “now” with 7-day expiration is stale; same form with simulated “now” at recording day is active.

## Open questions (resolved for planning)

- **CLI replay vs in-process harness:** Both must set simulated time — shared helper in scenario replay module.
- **Missing step timestamp:** Fall back to previous step or `recordedAt`; document in design.
