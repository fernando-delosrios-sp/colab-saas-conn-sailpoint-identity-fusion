## 1. FusionRun simulated time

- [x] 1.1 Add `simulatedTimeMs`, `setSimulatedTime()`, `clearSimulatedTime()`, and `currentTimeMs()` to `src/model/fusionRun.ts`
- [x] 1.2 Include simulated time in snapshot/restore if snapshot already serializes run fields (extend snapshot type as needed)
- [x] 1.3 Add unit tests in `src/model/__tests__/fusionRun.test.ts` for set/clear/currentTimeMs and snapshot round-trip (covers fusion-run spec scenarios)

## 2. Form stale cleanup uses run clock

- [x] 2.1 Change `FormLifecycle.isFormDefinitionStale` to use `this.deps.run.currentTimeMs()` instead of `Date.now()`
- [x] 2.2 Add tests in `src/services/formService/__tests__/formService.test.ts` or new focused test: form active/stale relative to simulated time (covers form-service spec scenarios)
- [x] 2.3 Audit form/aggregation code for other replay-sensitive `Date.now()` age checks; fix or document none found

## 3. In-process replay harness wiring

- [x] 3.1 Add shared helper (e.g. `src/operations/scenarioReplay/simulatedRecordingTime.ts`) to resolve step timestamp from `steps.ndjson` / `scenario.recordedAt`
- [x] 3.2 In `ScenarioRunner.executeStep`, set FusionRun simulated time on the operation run before step fn; clear in `finally`
- [x] 3.3 Ensure `buildReplayContext` / `createTestRegistry` path exposes the same FusionRun instance the operation uses (adjust if registry creates run before time is set)
- [x] 3.4 Add harness test with fixture forms backdated vs simulated time proving non-zero `formsFound` (covers testing spec unit scenario)

## 4. Spawned replay CLI wiring

- [x] 4.1 Pass step timestamp from `scenario-replay-orchestrator.cjs` to connector per step (env or existing replay metadata channel)
- [x] 4.2 Read timestamp in connector bootstrap / operation entry and call `run.setSimulatedTime()` before handler; clear after response
- [x] 4.3 Add or extend orchestrator integration test asserting simulated time metadata is sent (covers recording-service CLI scenario)

## 5. Regression verification

- [x] 5.1 Run targeted tests: `npm test -- src/model/__tests__/fusionRun.test.ts src/services/formService/__tests__/`
- [x] 5.2 Run scenario harness tests: `npm test -- src/operations/__tests__/scenario/`
- [x] 5.3 When local artifacts exist, verify `VERIFY_RECORDING_SCENARIO=company12926-poc/fernando npm test -- src/operations/__tests__/scenario/verifyRecording.cli.test.ts` passes (covers testing aged-recording scenario)
- [x] 5.4 Run `npm run lint`

## 6. Documentation

- [x] 6.1 Update `docs/reference/scenario-recording.md` — explain simulated recording time during replay and relationship to `fusionFormExpirationDays`
- [x] 6.2 Add brief JSDoc on `FusionRun.currentTimeMs()` and replay-only simulated time semantics

## 7. Changelog

- [x] 7.1 Add CHANGELOG entry: replay uses recorded step time for form stale checks; fixes false drift on aged scenario recordings
- [x] 7.2 Confirm entry covers user-visible replay verification improvement from Capabilities
