## Context

The connector supports chain record/replay for offline functional testing. Recording captures ISC API I/O (`api-log.ndjson`), operation steps (`steps.ndjson`), and compiled scenarios (`scenario.json`). Two consumption paths exist:

- **Live replay** (`npm run replay`): connector runs with `ReplayApiAdapter`; operations triggered manually.
- **Harness replay** (`ChainRunner` + `ReplayAdapter`): auto-executes scenario steps, compares `res.send()` outputs via `compareOutputs()`.

The harness replay logic currently lives only in `chain.replay.test.ts`, which auto-discovers `recordings/*/scenario.json`. Local dev recordings pollute `npm test`. The CJS finalize path (`record-chain.js` exit handler) clobbers connector-written scenario config.

## Goals / Non-Goals

**Goals:**
- Add `npm run test-recording -- <chainName>` for offline golden verification with drift output
- Make `npm test` pass regardless of local `recordings/` contents
- Fix config clobbering during CJS finalization
- Extract shared verification logic reusable by CLI and unit tests

**Non-Goals:**
- Change `npm run replay` behavior
- Refactor `ReplayAdapter` to use `ReplayApiAdapter` / real pipeline
- Commit golden recordings to the repo or add CI recording gates
- Assert state deltas, phase timing, or aggregation reports in verification

## Decisions

### D1: Shared verification module in test harness

- **Choice:** `src/operations/__tests__/chain/harness/chainRecordingVerify.ts` exports `registerChainStepFns()` and `verifyChainRecording(scenarioPath)`.
- **Reason:** Single source of truth for step registration and drift comparison; avoids duplicating 150+ lines in CLI.
- **Considered alternatives:**
  - *Vitest-only with env var* — Rejected: poor UX for manual/AI use.
  - *Pure CJS duplicate* — Rejected: diverges from harness.

### D2: CLI invokes Vitest runner for verification

- **Choice:** `scripts/test-recording.js` validates artifacts, then spawns `npx vitest run src/operations/__tests__/chain/verifyRecording.cli.test.ts` with `VERIFY_RECORDING_CHAIN` set. Integration coverage lives in `test-recording.script.test.ts` (spawn-based CLI tests).
- **Reason:** `ReplayAdapter` requires Vitest globals (`vi.fn()`); a standalone tsx runner would fail without a mock environment. Spawning Vitest reuses the harness faithfully.
- **Considered alternatives:**
  - *Add tsx runner* — Rejected: `ServiceRegistry is not a constructor` / missing `vi` when run outside Vitest.
  - *Add tsx to devDependencies* — Unnecessary given Vitest spawn works.

### D3: chain.replay.test.ts uses temp fixture

- **Choice:** Create minimal scenario in temp dir during test setup; assert harness mechanics and `compareOutputs` drift detection.
- **Reason:** Tests verify the machinery, not developer recordings.
- **Considered alternatives:**
  - *Skip chain.replay.test entirely* — Rejected: loses harness regression coverage.

### D4: Preserve config on CJS finalize

- **Choice:** `finalize-chain-artifacts.cjs` reads existing `scenario.json` if present; carries forward non-empty `config` into rebuilt scenario.
- **Reason:** Connector `RecordingService.buildScenario()` writes full config; CJS rebuild should not destroy it.
- **Considered alternatives:**
  - *Skip CJS finalize when scenario exists* — Rejected: manifest/step counts still need refresh; partial merge is safer.

## Risks / Trade-offs

- [Risk] `npx tsx` unavailable offline → Mitigation: document Node 24 + network for first run; same as other npx usage in scripts.
- [Risk] Stale local recordings still fail `test-recording` → Mitigation: expected; script reports drift clearly; re-record after finalize fix.
- [Trade-off] Verify module under `__tests__/` imported by production script → Accepted: only dev/CI tooling uses it.

## Migration Plan

N/A — This change does not involve deployment changes. Developers run `npm run test-recording -- <chain>` after recording. Re-record existing chains to regain full config in scenario.json.

## Open Questions

- None blocking implementation.
