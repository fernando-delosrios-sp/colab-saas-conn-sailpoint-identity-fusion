## Scope

**In:** Default `npm test` / `test:watch` / `test:coverage` exclude every Vitest file under `src/operations/__tests__/scenario/`; a dedicated npm script runs that suite; docs, AGENTS.md, and the testing spec describe the split. **Out:** `npm run test-recording` (named golden replay CLI), recording/replay production code, and adding a CI test job.

## Language

**Global test suite** (`draft`):
The default Vitest discovery set invoked by `npm test` (and watch/coverage wrappers) after excluding the scenario recording test suite.
_Avoid_: unit tests (too narrow), main tests, fast tests

**Scenario recording test suite** (`draft`):
Every Vitest file under `src/operations/__tests__/scenario/`, including fixture harness tests and env-gated recording replays. Distinct from a **scenario** (recording artifact under `recordings/<tenant>/{scenarioName}/`).
_Avoid_: chain tests, recording tests (ambiguous with `npm run test-recording`)

**test-recording** (canonical, existing):
The npm script that verifies one named scenario recording offline. Unchanged by this change.
_Avoid_: using this name for the Vitest suite

No `conflicts-with-canonical`. Canonical **scenario** (recording) stays the artifact noun; suite names are test-infrastructure labels only (`draft`, not `promote`).

## Decisions

- Context: `npm test` discovers all `src/**/*.test.ts`, including `src/operations/__tests__/scenario/*.test.ts`. Operators want that folder invoked separately.
- Q1: Entire folder vs env-gated-only vs recording-I/O-only? → **Entire `src/operations/__tests__/scenario/`** (user gate).
- Q2: Script name? → `npm run test:scenario` (Vitest on that glob). Do not reuse `test-recording`.
- Q3: Watch/coverage? → Same exclude as `npm test` so coverage numbers match the global suite.
- Q4: CI? → No new GitHub test job (repo still has no default unit-test workflow). Local/docs/AGENTS are the invocation contract.

## Open questions

None. Deferred: whether a future CI job should run `test:scenario` after the global suite.

## Scenarios discussed

- `npm test` completes without loading any file under `src/operations/__tests__/scenario/`.
- `npm run test:scenario` runs fixture tests (`chain.replay`, `orchestrator.integration`, `test-recording.script`, `finalizeChainArtifacts`, `simulatedRecordingTime`) without env vars.
- Env-gated files (`verifyRecording.cli`, `explore`, `refreshRecordingReports`) still skip unless their env vars are set; they live only in the scenario suite.
- Passing a path under `scenario/` to `npm test -- …` no longer discovers those files (exclude wins); docs must point at `test:scenario`.
- `npm run test-recording -- tenant/scenario` is unchanged.
