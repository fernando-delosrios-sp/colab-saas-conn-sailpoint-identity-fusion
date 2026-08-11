# Replay Simulated Recording Time — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make scenario replay evaluate time-sensitive logic (form stale cleanup) at each step's recorded timestamp so aged recordings verify without false drift.

**Architecture:** Add optional simulated time on `FusionRun` (`currentTimeMs()`). Form stale checks use run clock. Scenario replay harness and replay CLI set/clear simulated time per step alongside existing `ReplayApiAdapter.seekBefore()`.

**Tech Stack:** TypeScript, Node.js, Vitest, FusionRun, FormLifecycle, ScenarioRunner, scenario-replay orchestrator

**Canonical test command:** `npm test`

**References:** [design.md](./design.md), [tasks.md](./tasks.md), [specs/](./specs/)

---

## Task 1: FusionRun clock (TDD)

- [ ] **Step 1:** Write failing tests in `src/model/__tests__/fusionRun.test.ts` — `setSimulatedTime`, `clearSimulatedTime`, `currentTimeMs`
- [ ] **Step 2:** Implement on `FusionRun` in `src/model/fusionRun.ts`
- [ ] **Step 3:** Extend snapshot/restore if applicable; add snapshot test
- [ ] **Step 4:** Run `npm test -- src/model/__tests__/fusionRun.test.ts`

## Task 2: FormLifecycle stale check

- [ ] **Step 1:** Write failing test — form 3 days old, simulated time 10 days later, expiration 7 → active
- [ ] **Step 2:** Write failing test — form 10 days old vs simulated time, expiration 7 → stale
- [ ] **Step 3:** Change `isFormDefinitionStale` in `src/services/formService/formLifecycle.ts` to use `run.currentTimeMs()`
- [ ] **Step 4:** Run `npm test -- src/services/formService/__tests__/`

## Task 3: Timestamp resolution helper

- [ ] **Step 1:** Create `src/operations/scenarioReplay/simulatedRecordingTime.ts` with `resolveStepTimestamp(stepId, stepsTimestamps, recordedAt): string | undefined`
- [ ] **Step 2:** Export from `src/operations/scenarioReplay/index.ts`
- [ ] **Step 3:** Unit test fallback order: step ts → recordedAt → undefined
- [ ] **Step 4:** Run `npm test -- src/operations/scenarioReplay/`

## Task 4: ScenarioRunner wiring

- [ ] **Step 1:** In `ScenarioRunner.executeStep`, after building context, obtain FusionRun from registry and `setSimulatedTime(resolveStepTimestamp(...))`
- [ ] **Step 2:** Wrap step execution in try/finally; `clearSimulatedTime()` in finally
- [ ] **Step 3:** Add harness integration test with minimal fixture + backdated forms metadata
- [ ] **Step 4:** Run `npm test -- src/operations/__tests__/scenario/`

## Task 5: Replay CLI wiring

- [ ] **Step 1:** In `scripts/scenario-replay-orchestrator.cjs`, include step timestamp in each step POST (env `REPLAY_STEP_TIMESTAMP` or JSON body field)
- [ ] **Step 2:** In connector operation entry (proxy handler or safeReadConfig path), read timestamp and set on FusionRun before operation
- [ ] **Step 3:** Clear after operation completes
- [ ] **Step 4:** Smoke: document manual check in task notes; run orchestrator fixture test if present

## Task 6: Age-check audit

- [ ] **Step 1:** Grep `Date.now()` in `src/services/formService/` and replay-critical aggregation paths
- [ ] **Step 2:** Fix any age comparisons affecting replay output; otherwise note "audit clean" in commit message

## Task 7: Regression and lint

- [ ] **Step 1:** Run `npm test`
- [ ] **Step 2:** Optional local: `VERIFY_RECORDING_SCENARIO=company12926-poc/fernando npm test -- src/operations/__tests__/scenario/verifyRecording.cli.test.ts`
- [ ] **Step 3:** Run `npm run lint`

## Task 8: Documentation and changelog

- [ ] **Step 1:** Update `docs/reference/scenario-recording.md`
- [ ] **Step 2:** JSDoc on `FusionRun.currentTimeMs()`
- [ ] **Step 3:** CHANGELOG entry under Fixed/Replay section

**Commit points:** After Tasks 1–2 (model+form), Task 4 (harness), Task 5 (CLI), Task 8 (docs).
