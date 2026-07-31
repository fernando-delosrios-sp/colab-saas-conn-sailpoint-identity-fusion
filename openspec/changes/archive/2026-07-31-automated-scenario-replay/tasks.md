## 1. Terminology migration

- [x] 1.1 Rename `chainName` → `scenarioName` in `RecordingConfig` with deprecated `chainName` alias in `resolveRecordingConfig`
- [x] 1.2 Rename `RECORD_CHAIN_NAME` → `RECORD_SCENARIO_NAME` env with deprecated alias + warning
- [x] 1.3 Rename path helpers in `recordingPaths.ts` (`parseRecordingScenarioRef`, `recordingScenarioDir`)
- [x] 1.4 Rename scripts: `record-chain.js` → `record-scenario.js`, `replay-chain.js` → `replay-scenario.js`; update `package.json` script targets
- [x] 1.5 Rename test harness: `ChainRunner` → `ScenarioRunner`, `__tests__/chain/` → `__tests__/scenario/`, `chainRecordingVerify.ts` → `scenarioRecordingVerify.ts`
- [x] 1.6 Update `VERIFY_RECORDING_CHAIN` → `VERIFY_RECORDING_SCENARIO` with deprecated alias

## 2. Shared scenario replay module

- [x] 2.1 Create `src/operations/scenarioReplay/` with `operationTypeMap`, `compareOutputs`, `sanitizeScenarioConfigForReplay`
- [x] 2.2 Refactor `scenarioRecordingVerify.ts` and `ReplayAdapter.ts` to import shared module
- [x] 2.3 Add unit tests for shared compare and type-map utilities

## 3. Scenario replay orchestrator

- [x] 3.1 Implement `scripts/scenario-replay-orchestrator.cjs` (spawn proxy, wait-on port, feed steps via HTTP POST)
- [x] 3.2 Rewrite `replay-scenario.js` default flow: scenario picker → orchestrator (remove manual spcx default)
- [x] 3.3 Implement live debug UX: step banners, stdout streaming, `--pause-on-fail`, `--step`, `--no-verify`
- [x] 3.4 Write `replay-report.json` on completion; non-zero exit on failure/drift
- [x] 3.5 Add orchestrator integration test with minimal fixture scenario

## 4. Replay safety and record deprecation

- [x] 4.1 Add replay-mode tenant-safe guard in `ServiceRegistry` constructor
- [x] 4.2 Add unit test asserting replay mode never wires live `SdkApiAdapter`
- [x] 4.3 Add deprecation warning banner to `record-scenario.js` pointing to External Settings

## 5. Spec and test coverage

- [x] 5.1 Add tests for replay CLI auto-feed success path (fixture scenario)
- [x] 5.2 Add tests for replay CLI drift detection and non-zero exit
- [x] 5.3 Add tests for deprecated env var aliases (`RECORD_CHAIN_NAME`, `RECORD_MODE`)
- [x] 5.4 Verify `npm run test-recording` unchanged behavior after shared module extraction

## 6. Documentation

- [x] 6.1 Rename `docs/reference/chain-recording.md` → `scenario-recording.md` and rewrite capture/replay/finalize workflows
- [x] 6.2 Update README recording/replay section for new command roles
- [x] 6.3 Update CLI `--help` and prompt strings to use "scenario" terminology

## 7. Changelog

- [x] 7.1 Create or update CHANGELOG entry for automated replay, scenario terminology, and record deprecation
- [x] 7.2 Confirm entry covers user-visible behavior changes from proposal Capabilities section
