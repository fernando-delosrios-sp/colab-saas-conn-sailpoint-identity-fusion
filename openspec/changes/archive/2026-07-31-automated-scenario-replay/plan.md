# Automated Scenario Replay Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make `npm run replay` spawn a local connector, auto-feed scenario steps with live debug output, unify scenario terminology, and deprecate `npm run record`.

**Architecture:** Shared `scenarioReplay` module feeds both the in-process ScenarioRunner harness and a new `scenario-replay-orchestrator.cjs` that spawns proxy-server with `REPLAY_MODE`, POSTs steps sequentially, and compares goldens. Terminology migration renames chain→scenario with deprecated aliases for one release.

**Tech Stack:** TypeScript, Node.js, Vitest, proxy-server.cjs, ReplayApiAdapter

**References:** [design.md](./design.md), [tasks.md](./tasks.md), [specs/](./specs/)

---

## Task 1: Terminology — config and env

- [ ] **Step 1:** Add `scenarioName` to `RecordingConfig` in `src/model/config.ts`; keep `chainName` as optional deprecated field
- [ ] **Step 2:** Update `resolveRecordingConfig.ts` — read `RECORD_SCENARIO_NAME`, alias `RECORD_CHAIN_NAME` with `console.warn`
- [ ] **Step 3:** Update `readConfig.ts` bridge to set `scenarioName` from `recordingName`
- [ ] **Step 4:** Add tests in `resolveRecordingConfig.test.ts` for new env vars and deprecated aliases
- [ ] **Step 5:** Run `npm test -- src/data/config/__tests__/resolveRecordingConfig.test.ts`

## Task 2: Terminology — paths and scripts

- [ ] **Step 1:** Rename helpers in `src/data/recordingPaths.ts` (`parseRecordingScenarioRef`, `recordingScenarioDir`); export deprecated aliases
- [ ] **Step 2:** Rename `scripts/recording-paths.cjs` helpers similarly
- [ ] **Step 3:** Rename `record-chain.js` → `record-scenario.js`, `replay-chain.js` → `replay-scenario.js`; update `package.json`
- [ ] **Step 4:** Update `finalize-chain.js` → `finalize-scenario.js` prompts to say "scenario"
- [ ] **Step 5:** Run path-related tests

## Task 3: Shared scenario replay module

- [ ] **Step 1:** Create `src/operations/scenarioReplay/compareOutputs.ts` — extract from `ReplayAdapter.ts`
- [ ] **Step 2:** Create `src/operations/scenarioReplay/operationTypeMap.ts` — map operation names to SDK types
- [ ] **Step 3:** Create `src/operations/scenarioReplay/sanitizeScenarioConfig.ts` — extract from ChainRunner
- [ ] **Step 4:** Add `src/operations/scenarioReplay/index.ts` barrel export
- [ ] **Step 5:** Refactor `chainRecordingVerify.ts` imports; add unit tests
- [ ] **Step 6:** Run `npm test -- src/operations/__tests__/chain/`

## Task 4: Rename test harness to ScenarioRunner

- [ ] **Step 1:** Rename `ChainRunner.ts` → `ScenarioRunner.ts`; update class name and imports
- [ ] **Step 2:** Move `src/operations/__tests__/chain/` → `scenario/` (update vitest paths if needed)
- [ ] **Step 3:** Rename `chainRecordingVerify.ts` → `scenarioRecordingVerify.ts`
- [ ] **Step 4:** Update `VERIFY_RECORDING_SCENARIO` env in `test-recording.js` with deprecated alias
- [ ] **Step 5:** Run `npm test -- src/operations/__tests__/scenario/`

## Task 5: Scenario replay orchestrator

- [ ] **Step 1:** Create `scripts/scenario-replay-orchestrator.cjs` — validate scenario dir, load `scenario.json`
- [ ] **Step 2:** Spawn `proxy-server.cjs dist/index.js` with `REPLAY_MODE=true`, `RECORD_SCENARIO_NAME`; wait-on port 3000
- [ ] **Step 3:** Implement step loop: banner → HTTP POST → collect NDJSON → compare (unless `--no-verify`)
- [ ] **Step 4:** Stream proxy stdout/stderr to terminal; implement `--step`, `--pause-on-fail`, `--no-verify`
- [ ] **Step 5:** Write `replay-report.json`; exit non-zero on failure
- [ ] **Step 6:** Rewrite `replay-scenario.js` to delegate to orchestrator by default

## Task 6: Replay safety guard

- [ ] **Step 1:** In `ServiceRegistry` constructor, when `recording.mode === 'replay'`, assert `ReplayApiAdapter` wiring
- [ ] **Step 2:** Log startup message: replay mode active, no live ISC calls permitted
- [ ] **Step 3:** Add test in `serviceRegistry.recording.test.ts`
- [ ] **Step 4:** Run `npm test -- src/services/__tests__/serviceRegistry.recording.test.ts`

## Task 7: Deprecate record script

- [ ] **Step 1:** Add deprecation banner to `record-scenario.js` referencing External Settings
- [ ] **Step 2:** Log deprecation warning in `resolveRecordingConfig` when `RECORD_MODE=true`

## Task 8: Integration tests and verification

- [ ] **Step 1:** Add orchestrator integration test using minimal fixture scenario
- [ ] **Step 2:** Run `npm test -- src/operations/__tests__/scenario/`
- [ ] **Step 3:** Run `npm run lint`
- [ ] **Step 4:** Manual smoke: `npm run build && npm run replay -- <fixture-scenario>`

## Task 9: Documentation and changelog

- [ ] **Step 1:** Rename and rewrite `docs/reference/scenario-recording.md`
- [ ] **Step 2:** Update README replay/record sections
- [ ] **Step 3:** Update CHANGELOG.md
- [ ] **Step 4:** Run `npm run lint:markdown`
