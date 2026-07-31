# Scenario recording (dev/CI)

Capture and replay ISC API interactions for offline regression and interactive debugging.

Artifacts live under `recordings/<tenant>/{scenarioName}/`, where `<tenant>` is derived from connection Base URL (fallback `unknown-tenant`).

## Capture (canonical: External Settings)

**Recommended:** enable capture on a proxy deployment via ISC **External Settings**:

1. **Enable external processing?** — on  
2. **Enable proxy mode?** — on (required for filesystem writes on the proxy host)  
3. **Enable chain recording?** — on  
4. **Recording chain name** (`recordingName`) — scenario segment only (for example `fernando`)

`safeReadConfig()` bridges this into `config.recording.mode = 'record'` and `config.recording.scenarioName` on the proxy server unless explicit `recording.mode` or env vars override.

| File | Purpose |
| --- | --- |
| `api-log.ndjson` | Append-only ISC API request/response pairs |
| `steps.ndjson` | Per-operation inputs, outputs, and state snapshots |
| `phases.ndjson` | Phase boundary summaries (when account-list runs) |
| `scenario.json` | Compiled replay scenario (written on process exit) |
| `manifest.json` | Store type, artifact paths, and entry counts |
| `reports/aggregation.json` | Local aggregation report snapshot (when generated) |
| `reports/matching-results.json` | Per-account match outcomes with score breakdowns (record-mode account-list) |
| `replay-report.json` | Per-step results from the last automated replay run |
| `connector.log` | Stdout/stderr capture from local scripts |

`reports/matching-results.json` is written at the end of each record-mode account-list operation. Re-record existing scenarios to populate it.

Legacy `record-chain.js` and `replay-chain.js` scripts remain as deprecated wrappers that forward to the scenario scripts above.

### Legacy `npm run record` (deprecated)

```bash
npm run build
npm run record
```

Prints a deprecation warning — prefer External Settings for capture. Enter a scenario reference as **`tenant/scenarioName`** (for example `company12926-poc/fernando`). A bare name works when `BASEURL` or `ISC_BASEURL` is set.

Env vars (fallback when config fields are unset): `RECORD_MODE`, `RECORD_SCENARIO_NAME` (preferred), deprecated `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING`.

## Replay (automated, interactive)

`npm run replay` spawns a local proxy-server connector in replay mode, auto-feeds every step from `scenario.json`, streams live output, compares goldens, and writes `replay-report.json`.

```bash
npm run build
npm run replay -- "company12926-poc/fernando"
```

**Debug flags:**

| Flag | Effect |
| --- | --- |
| `--no-verify` | Run steps without golden comparison |
| `--step <id>` | Run a single step (for example `step-3`) |
| `--pause-on-fail` | Wait for Enter after a failed step |

Omit the scenario argument to pick from scenarios that have a non-empty `api-log.ndjson`. **Quote refs that contain `/`** so the shell does not split them.

Replay serves all ISC calls from `api-log.ndjson` via `ReplayApiAdapter` — no live tenant API calls.

## Finalize (recovery)

If the connector exits without writing `scenario.json` (crash, `kill -9`):

```bash
npm run finalize -- "company12926-poc/fernando"
```

Normal Ctrl+C on a recording session auto-finalizes; use finalize only for recovery.

## Regression verification (offline)

Verify a scenario offline with golden output comparison (in-process harness, no proxy spawn):

```bash
npm run test-recording -- "company12926-poc/fernando"
```

Auto-runs all steps in `scenario.json`, compares outputs against recorded goldens, prints drift details, and exits non-zero on failure.

| Command | Use when |
| --- | --- |
| `npm run replay` | Interactive debugging with live connector output |
| `npm run test-recording` | Fast headless regression in CI or before commit |

## Harness unit tests

No local recordings required:

```bash
npm test -- src/operations/__tests__/scenario/chain.replay.test.ts
```
