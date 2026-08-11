## Why

Scenario replay verifies recorded goldens by running the real connector pipeline against `api-log.ndjson`. Several code paths — notably form-definition stale cleanup — compare artifact ages to **`Date.now()`** (wall clock). When a recording is older than `fusionFormExpirationDays` (default 7), replay discards every form as stale even though the recorded step still had active forms. That produces false drift: missing review decisions, missing merged identities, empty reviewer URLs, and wrong account counts (observed on `company12926-poc/fernando` step-23). Offline verification must behave as if time were frozen at the recorded step, not at the developer's clock.

## What Changes

**Simulated recording time during replay**
- From: Time-sensitive logic (form stale partition, related age checks) uses wall-clock `Date.now()` in all modes.
- To: When replay mode is active, the operation run exposes a simulated "now" derived from the current step's recorded timestamp; age-sensitive logic reads that value instead of wall clock.
- Reason: Replay must reproduce recorded aggregation semantics days or weeks after capture without re-recording.
- Impact: Non-breaking for live aggregation and record mode; replay and offline verification only.

**Replay harness sets simulated time per step**
- From: `ScenarioRunner` and the replay CLI seek the API log by step timestamp but do not align runtime clocks.
- To: Both in-process verification (`npm run test-recording`) and spawned replay CLI set simulated time at the start of each step (same source as `seekBefore`), clearing it after the step completes.
- Reason: Keeps API cursor alignment and temporal logic consistent.
- Impact: Non-breaking; confined to replay entry points.

**Form stale evaluation uses run clock**
- From: `FormLifecycle.isFormDefinitionStale()` subtracts expiration days from `Date.now()`.
- To: Stale checks subtract expiration days from `FusionRun.currentTimeMs()` (simulated when set, else wall clock).
- Reason: Direct fix for the fernando drift root cause; preserves production stale cleanup semantics at real time.
- Impact: Non-breaking; behavior change only when simulated time is set.

## Capabilities

### New Capabilities

_(none — changes fit existing specs)_

### Modified Capabilities

- `fusion-run`: Add run-scoped simulated time accessor and setter used during replay.
- `form-service`: Form stale-age evaluation MUST use run clock, not bare wall clock.
- `recording-service`: Replay mode MUST establish simulated recording time per scenario step.
- `testing`: Offline scenario verification MUST pass when recording age exceeds form expiration if simulated time is correct.

## Impact

- **Model:** `src/model/fusionRun.ts` — simulated time field and `currentTimeMs()` accessor
- **Form layer:** `src/services/formService/formLifecycle.ts` (and any other replay-sensitive age checks found in audit)
- **Replay harness:** `src/operations/__tests__/scenario/framework/ScenarioRunner.ts`, `src/operations/__tests__/scenario/harness/ReplayAdapter.ts`
- **CLI:** `scripts/scenario-replay-orchestrator.cjs` / shared replay lib — pass step timestamp into connector context
- **Tests:** Unit tests for run clock + stale partition; integration test using dated fixture or mocked timestamps; optional `company12926-poc/fernando` verify when local artifacts present
- **Docs:** `docs/reference/scenario-recording.md` — note replay time simulation and recording age limits
