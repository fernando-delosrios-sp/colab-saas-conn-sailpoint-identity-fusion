# Chain recording (dev/CI)

Record ISC API interactions for offline chain replay tests:

```bash
npm run build
npm run record
```

Enter a chain reference as **`tenant/chainName`** (for example `company12926-poc/fernando`). The connector runs in record mode and writes artifacts under `recordings/<tenant>/{chainName}/`.

You can still enter a bare chain name (for example `fernando`) when `BASEURL` or `ISC_BASEURL` is set — the tenant folder is derived from that URL (fallback `unknown-tenant`).

| File | Purpose |
| --- | --- |
| `api-log.ndjson` | Append-only ISC API request/response pairs |
| `steps.ndjson` | Per-operation inputs, outputs, and state snapshots |
| `phases.ndjson` | Phase boundary summaries (when account-list runs) |
| `scenario.json` | Compiled replay scenario (written on process exit) |
| `manifest.json` | Store type, artifact paths, and entry counts |
| `reports/aggregation.json` | Local aggregation report snapshot (when generated) |
| `reports/matching-results.json` | Per-account match outcomes with score breakdowns (record-mode account-list) |
| `connector.log` | Stdout/stderr capture from `record-chain.js` |

Recording is dev-only. Set `RECORD_MODE`, `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING` env vars (used by `npm run record`) or configure `FusionConfig.recording` explicitly. `RECORD_CHAIN_NAME` accepts `tenant/chainName`. Explicit config wins over env vars.

**ISC UI (proxy deployments):** When **Enable external processing?**, **Enable proxy mode?**, and **Enable chain recording?** are all on, set **Recording chain name** (`recordingName`) to the chain segment only (for example `fernando`). The tenant folder comes from connection **Base URL** on the proxy server. `safeReadConfig()` bridges this into `config.recording.mode = 'record'` and `config.recording.chainName` on the proxy server unless explicit `recording.mode` or env vars override. Recording requires proxy mode in the UI (filesystem constraint on the processing host).

`reports/matching-results.json` is written at the end of each record-mode account-list operation. It contains identity matches, deferred matches (with per-attribute scores), non-matches, failed matches, and sweep summary counts. Chains recorded before this artifact existed must be re-recorded to populate it.

## Replay

Replay a recorded chain against the local connector (ISC API calls served from `api-log.ndjson`):

```bash
npm run build
npm run replay -- "company12926-poc/fernando"
```

Set `REPLAY_MODE=true` and `RECORD_CHAIN_NAME=company12926-poc/fernando` (same env vars as record mode, with replay instead of record).

## Regression verification

Verify a recording offline with golden output comparison (runs outside the main test suite):

```bash
npm run test-recording -- "company12926-poc/fernando"
```

Pass the chain reference directly or omit it to pick from a prompt. **Quote refs that contain `/`** so the shell does not split them (e.g. `"company12926-poc/fernando"`). The command auto-runs all steps in `scenario.json`, compares outputs against recorded goldens, prints drift details, and exits non-zero on failure. Use `npm run replay` for live connector debugging with recorded ISC API data; use `npm run test-recording` for automated regression verification.

## Harness unit tests

Harness unit tests (no local recordings required):

```bash
npm test -- src/operations/__tests__/chain/chain.replay.test.ts
```

