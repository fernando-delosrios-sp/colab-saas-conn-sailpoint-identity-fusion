# Brainstorm: Automated Scenario Replay

## Background

The connector has a mature recording/replay infrastructure at the ISC API adapter seam (`RecordingApiAdapter`, `ReplayApiAdapter`), scenario artifacts (`steps.ndjson`, `api-log.ndjson`, `scenario.json`), and an in-process test harness (`ChainRunner`, `chainRecordingVerify`, `npm run test-recording`). However, the developer-facing replay workflow is split and incomplete:

- `npm run replay` spawns spcx in replay mode but requires **manual operation entry** — it does not feed `scenario.json` steps.
- `npm run test-recording` auto-feeds steps but runs **in-process Vitest** — good for regression, poor for watching a real spawned connector debug live.
- Terminology mixes **chain** and **scenario** for the same concept.
- `npm run record` duplicates capture that ISC External Settings (`externalRecordingEnabled` + `recordingName`) already provides via config flags.

**Goal:** Make `npm run replay` the primary interactive debug path — pick a scenario, spawn connector, feed operations sequentially as the test harness would, with live terminal output.

---

## Decision Chain

### Q1: What execution mode for automated replay?

**Options considered:**
- Replay mode (`ReplayApiAdapter`) — deterministic, serves recorded API responses, no live tenant calls
- Dry-run mode (`DryRunApiAdapter`) — live reads, inhibited writes
- Both modes via flag

**Decision:** Replay mode only. User confirmed replay mode with explicit requirement to contain all live ISC writes (replay already does via pure-proxy adapter). Dry-run hits live reads and defeats deterministic regression/debug replay.

### Q2: How should the connector be spawned and fed?

**Options considered:**
- spcx stdin feeding (undocumented, unreliable)
- In-process only (existing test-recording path)
- proxy-server HTTP POST per step

**Decision:** proxy-server (`scripts/proxy-server.cjs`). Accepts `{ type, input, config }` POSTs, calls `connector._exec`. One proxy process for full scenario run; orchestrator POSTs steps sequentially.

### Q3: Should replay auto-feed be opt-in (`--auto`) or default?

**Decision:** Default behavior of `npm run replay`. Remove manual spcx wait-for-input as primary path. Debug intent is watch process unfold — auto-feed is essential.

### Q4: Terminology — chain vs scenario?

**Decision:** Unify to **scenario** only in recording/replay domain. Rename symbols, env vars, scripts, test harness (`ChainRunner` → `ScenarioRunner`). Keep on-disk folder layout unchanged. Deprecated aliases for one release (`RECORD_CHAIN_NAME`, etc.).

### Q5: Deprecate `npm run record`?

**Decision:** Yes. Capture is a **configuration concern** (External Settings), not a CLI run mode. `recording.mode = 'record'` remains internal, activated by `externalRecordingEnabled` + `recordingName`. Deprecate `npm run record` with warning banner; remove in follow-up release. Keep `npm run finalize` as optional recovery when auto-finalize on Ctrl+C didn't run (crash, kill -9).

### Q6: What about cross-step in-memory state?

**Context:** Each proxy POST creates fresh `ServiceRegistry`. Harness uses `seekBefore()` per step for API timeline alignment; `ChainState` reuses registry in-process tests.

**Decision (v1):** Accept per-step isolation — same as current harness model. Document limitation. Evaluate persistent proxy session mode only if debugging proves insufficient.

### Q7: Debug vs regression — what's primary for `npm run replay`?

**Decision:** Debug-first. Live connector logs stream to terminal per step. Golden comparison runs after each step but `--no-verify` skips it. `--pause-on-fail` and `--step <id>` for interactive inspection. `npm run test-recording` remains fast headless regression path.

---

## Design Trade-offs

| Trade-off | Choice | Rationale |
|---|---|---|
| Fidelity vs speed | Spawned proxy (slower) over in-process only | Real operationHandler + module load path matches production debugging |
| Manual vs auto replay | Auto-feed default | User intent is replay captured sequence, not manual re-entry |
| Record CLI vs ISC config | Deprecate record CLI | Single canonical capture path; reduces env-var run modes |
| Terminology migration scope | Full rename with deprecated aliases | Eliminates confusion; one release transition |
| Finalize CLI | Keep as optional recovery | Ctrl+C auto-finalizes; finalize covers crash/kill -9 edge cases |

---

## Validated Design Summary

1. **`npm run replay`** — prompt/arg scenario → spawn proxy with `REPLAY_MODE` → feed all `scenario.json` steps → live logs + optional golden verify → `replay-report.json`
2. **Deprecate `npm run record`** — External Settings capture is canonical
3. **Terminology** — scenario only; chain retired in this domain
4. **Shared module** — extract compare/feed utilities from test harness for CLI + ScenarioRunner parity
5. **Safety guard** — assert no live SDK egress in replay mode
6. **Flags** — `--step`, `--pause-on-fail`, `--no-verify`
