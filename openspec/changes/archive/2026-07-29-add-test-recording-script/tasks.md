## 1. Shared verification module

- [x] 1.1 Create `src/operations/__tests__/chain/harness/chainRecordingVerify.ts` with `StepVerifyResult`, `ChainVerifyResult` types
- [x] 1.2 Move step registration from `chain.replay.test.ts` into `registerChainStepFns()`
- [x] 1.3 Implement `verifyChainRecording(scenarioPath)` — execute all steps, run `compareOutputs`, return structured results

## 2. test-recording CLI

- [x] 2.1 Create `scripts/test-recording.js` — chain name arg or prompt, validate artifacts, list available chains
- [x] 2.2 Create `scripts/test-recording-runner.ts` — import verify module, print per-step report, exit 1 on failure (implemented via `verifyRecording.cli.test.ts` + vitest spawn)
- [x] 2.3 Add `"test-recording": "node scripts/test-recording.js"` to `package.json`

## 3. Fix chain.replay.test.ts

- [x] 3.1 Remove `availableRecordings()` scan of `recordings/`
- [x] 3.2 Add temp-fixture tests: verifyChainRecording success, compareOutputs drift detection, scenario structure validation
- [x] 3.3 Remove debug console.log statements (Brian 17/18)

## 4. Fix scenario finalization

- [x] 4.1 Update `scripts/finalize-chain-artifacts.cjs` to preserve existing non-empty `config` when rebuilding scenario
- [x] 4.2 Add unit test or script-level test covering config preservation behavior

## 5. Verification

- [x] 5.1 Run `npm test -- src/operations/__tests__/chain/chain.replay.test.ts` — passes without local recordings
- [x] 5.2 Run `npm test` — full suite green (1304 passed, 1 skipped)
- [x] 5.3 Run `npm run test-recording -- fernando` — exits 1 with clear drift output (stale local recording; expected)

## 6. Documentation

- [x] 6.1 Update README Chain recording section: document `test-recording` vs `replay` distinction
- [x] 6.2 Update inline CLI help text in `scripts/test-recording.js` for chain name usage
- [x] 6.3 N/A — no connector public API contract change beyond npm scripts

## 7. Changelog

- [x] 7.1 Create or update changelog entry for `test-recording` script and chain replay test isolation
- [x] 7.2 Confirm entry covers user-visible behavior: new npm script, npm test no longer depends on local recordings
