# Chain recording (dev/CI)

Record ISC API interactions for offline chain replay tests:

```bash
npm run build
npm run record
```

Enter a chain name when prompted. The connector runs in record mode and writes artifacts under `recordings/{chainName}/`:

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

Recording is dev-only. Set `RECORD_MODE`, `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING` env vars (used by `npm run record`) or configure `FusionConfig.recording` explicitly. Explicit config wins over env vars.

`reports/matching-results.json` is written at the end of each record-mode account-list operation. It contains identity matches, deferred matches (with per-attribute scores), non-matches, failed matches, and sweep summary counts. Chains recorded before this artifact existed must be re-recorded to populate it.

## Replay

Replay a recorded chain against the local connector (ISC API calls served from `api-log.ndjson`):

```bash
npm run build
npm run replay
```

Pass the chain name directly: `npm run replay -- fernando`. Set `REPLAY_MODE=true` and `RECORD_CHAIN_NAME` (same env vars as record mode, with replay instead of record).

## Regression verification

Verify a recording offline with golden output comparison (runs outside the main test suite):

```bash
npm run test-recording -- fernando
```

Pass the chain name directly or omit it to pick from a prompt. The command auto-runs all steps in `scenario.json`, compares outputs against recorded goldens, prints drift details, and exits non-zero on failure. Use `npm run replay` for live connector debugging with recorded ISC API data; use `npm run test-recording` for automated regression verification.

## Harness unit tests

Harness unit tests (no local recordings required):

```bash
npm test -- src/operations/__tests__/chain/chain.replay.test.ts
```
