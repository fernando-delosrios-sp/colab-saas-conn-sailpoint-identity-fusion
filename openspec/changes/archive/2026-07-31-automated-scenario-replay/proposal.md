## Why

`npm run replay` spawns a local connector in replay mode but requires manual operation entry, so it cannot replay a captured scenario for interactive debugging. The in-process `npm run test-recording` path auto-feeds steps but runs inside Vitest, hiding the real connector execution developers need to watch. Terminology mixes "chain" and "scenario" for the same artifact, and `npm run record` duplicates capture that ISC External Settings already provides via configuration flags.

## What Changes

**Replay CLI becomes automated and debug-first**
- From: `npm run replay` spawns spcx and waits for manual operations.
- To: `npm run replay` prompts for a scenario, spawns proxy-server in replay mode, feeds all `scenario.json` steps sequentially with live terminal output, optional golden verification, and non-zero exit on drift.
- Reason: Primary debug workflow for captured scenarios and regression investigation.
- Impact: Non-breaking for `npm run test-recording`; replaces manual replay UX.

**Deprecate `npm run record`**
- From: `npm run record` launches local spcx with `RECORD_MODE` env vars as a capture entry point.
- To: Capture documented via ISC External Settings (`externalRecordingEnabled` + `recordingName`); `npm run record` prints deprecation warning and remains functional one release.
- Reason: Recording is a config concern, not a separate CLI run mode.
- Impact: Non-breaking v1; docs and warnings guide operators to External Settings.

**Unify terminology to scenario**
- From: Mixed "chain" / "scenario" in code, env vars, scripts, docs, and test harness names.
- To: "Scenario" is canonical (`scenarioRef`, `scenarioName`, `ScenarioRunner`, `scenario-recording.md`); deprecated aliases for one release.
- Reason: Single vocabulary for recording/replay domain.
- Impact: Non-breaking with aliases; file renames in scripts and test harness.

**Replay tenant-safety guard**
- From: Replay mode relies on `ReplayApiAdapter` with no explicit egress guard.
- To: ServiceRegistry asserts replay wiring and fails fast if live SDK adapter could be reached.
- Reason: Belt-and-suspenders containment matching dry-run safety expectations.
- Impact: Non-breaking; replay-only startup check.

## Capabilities

### New Capabilities

_(none — changes fit existing specs)_

### Modified Capabilities

- `testing`: New requirement for automated scenario replay CLI; ScenarioRunner rename; shared replay utilities contract.
- `recording-service`: Capture via External Settings as canonical path; deprecate record CLI; scenario terminology; `replay-report.json` artifact.
- `ubiquitous-language`: Add Scenario (recording) term; retire chain in recording/replay domain.
- `documentation-site`: Update scenario recording reference docs and command roles.

## Impact

- **Scripts:** `replay-chain.js` → `replay-scenario.js`, new `scenario-replay-orchestrator.cjs`, deprecate `record-chain.js`
- **Source:** `src/operations/scenarioReplay/` shared module; `ServiceRegistry` replay guard; rename `__tests__/chain/` → `__tests__/scenario/`
- **Config:** `scenarioName` with `chainName` alias; `RECORD_SCENARIO_NAME` with deprecated env aliases
- **Docs:** `docs/reference/scenario-recording.md` (renamed from chain-recording)
- **Unchanged behavior:** `npm run test-recording` regression path; on-disk `recordings/<tenant>/<name>/` layout
