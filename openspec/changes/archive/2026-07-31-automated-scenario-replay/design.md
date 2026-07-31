## Context

The connector records operation sequences and ISC API interactions into tenant-scoped directories under `recordings/<tenant>/<name>/`. Artifacts include `steps.ndjson`, `api-log.ndjson`, and compiled `scenario.json`. Capture today can happen via ISC External Settings (config flags bridged in `readConfig.ts`) or legacy `npm run record` (env-var spcx spawn).

Replay infrastructure is complete at the API seam (`ReplayApiAdapter`) and in the in-process test harness (`ChainRunner`, `chainRecordingVerify`, `npm run test-recording`). The gap is orchestration: no CLI spawns a real connector and feeds scenario steps with live debug output.

Stakeholders: connector developers debugging captured scenarios, AI agents running regression checks, operators capturing scenarios via ISC proxy deployments.

## Goals / Non-Goals

**Goals:**
- `npm run replay` auto-feeds all scenario steps through a spawned local connector with live terminal output
- Debug flags: `--step`, `--pause-on-fail`, `--no-verify`
- Golden comparison and `replay-report.json` for regression signal
- Unify recording/replay vocabulary to "scenario"
- Deprecate `npm run record`; document External Settings as canonical capture
- Replay mode tenant-safety guard in ServiceRegistry

**Non-Goals:**
- Remove `npm run record` entirely in v1
- Dry-run + replay combination
- Committed production recordings in git
- Persistent cross-step in-memory registry session (evaluate in v2 if needed)
- Replace `npm run test-recording`

## Decisions

### D1: Spawn via proxy-server, feed via HTTP POST

- **Choice:** Orchestrator spawns `proxy-server.cjs dist/index.js` with `REPLAY_MODE=true`, POSTs each step as `{ type, input, config }` to `localhost:3000`.
- **Reason:** proxy-server already implements programmatic operation invocation; spcx stdin protocol is undocumented.
- **Considered alternatives:** spcx stdin (rejected — unreliable); in-process only (rejected — already exists as test-recording).

### D2: Replay mode, not dry-run

- **Choice:** `ReplayApiAdapter` serves all ISC calls from `api-log.ndjson`; no live tenant reads or writes.
- **Reason:** Deterministic replay for debugging and regression; user confirmed replay with write containment.
- **Considered alternatives:** Dry-run overlay (rejected — live reads break determinism).

### D3: Auto-feed is default replay behavior

- **Choice:** Remove manual spcx wait-for-input as primary `npm run replay` path.
- **Reason:** User intent is replay captured sequence interactively, not re-enter operations manually.

### D4: Per-step registry isolation (v1)

- **Choice:** Each proxy POST creates fresh ServiceRegistry; API timeline aligned via recorded config + api-log (same as harness `seekBefore` model).
- **Reason:** Matches existing test harness semantics; simpler orchestrator.
- **Considered alternatives:** Persistent session keeping one registry (deferred — v2 if debugging proves insufficient).

### D5: Shared module between CLI and ScenarioRunner

- **Choice:** Extract `operationTypeMap`, `compareOutputs`, `sanitizeScenarioConfigForReplay` to `src/operations/scenarioReplay/`.
- **Reason:** Single source of truth; prevents CLI/harness drift.

### D6: Terminology migration with deprecated aliases

- **Choice:** Rename chain → scenario across code/docs; keep `RECORD_CHAIN_NAME`, `chainName`, `VERIFY_RECORDING_CHAIN` as deprecated aliases one release.
- **Reason:** Clean vocabulary without breaking existing dev scripts immediately.

### D7: Deprecate record CLI, keep finalize as recovery

- **Choice:** Warn on `npm run record`; Ctrl+C on proxy auto-finalizes; `npm run finalize` for crash/kill -9 recovery only.
- **Reason:** Capture is config-driven via External Settings; finalize handles edge cases only.

## Risks / Trade-offs

- [Risk] Per-step isolation misses bugs depending on in-memory state across steps → Mitigation: document limitation; in-process ScenarioRunner retains ChainState reuse for headless tests
- [Risk] Long scenarios slow due to sequential HTTP posts → Mitigation: acceptable for v1 debug path; test-recording remains fast path
- [Risk] Terminology rename touches many files → Mitigation: phased rename with deprecated aliases; focused PR scope
- [Trade-off] Proxy spawn adds startup overhead vs in-process → Accepted: fidelity for interactive debugging

## Migration Plan

1. Ship orchestrator + replay CLI rewrite behind same `npm run replay` script name
2. Add deprecation warnings to `npm run record` and legacy env vars
3. Rename docs to `scenario-recording.md`; update External Settings capture as step 1
4. One release later: remove deprecated aliases and `record` script (follow-up change)
5. Rollback: revert scripts; replay falls back to manual spcx mode

## Open Questions

- None blocking v1. Persistent proxy session mode deferred pending debug feedback.
