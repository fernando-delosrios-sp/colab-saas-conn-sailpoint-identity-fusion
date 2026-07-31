# Data-driven testing process

Identity Fusion NG supports two complementary test layers: **scenario recording/replay** for integration regression against real ISC API traces, and **in-process scenario harness tests** for deterministic sweep-based validation.

## Goals

- Keep test inputs editable and reviewable (JSON artifacts).
- Re-run aggregations deterministically with the same recorded or fixture data.
- Capture generated outputs, side effects, and match score breakdowns for diff review.

## Scenario recording and replay (recommended)

Recorded scenarios live under `recordings/<tenant>/{scenarioName}/`. See the full reference in [Scenario recording](../../reference/scenario-recording.md).

### Artifact layout

| File | When written | Contents |
| --- | --- | --- |
| `api-log.ndjson` | During operation | ISC API request/response pairs for replay |
| `steps.ndjson` | Per operation step | Inputs, outputs, and `FusionRun` state snapshots |
| `phases.ndjson` | Account-list phases | Phase boundaries with elapsed time and counts |
| `scenario.json` | Process exit | Compiled replay scenario with config and goldens |
| `manifest.json` | Process exit | Store type, artifact paths, entry counts |
| `reports/aggregation.json` | Report epilogue (when enabled) | Aggregation report payload |
| `reports/matching-results.json` | Record-mode account-list | Match outcomes with score breakdowns |
| `replay-report.json` | After `npm run replay` | Per-step pass/fail from last replay |

### Capture

Enable recording on a proxy deployment via **External Settings** (see [Scenario recording — Capture](../../reference/scenario-recording.md#capture-canonical-external-settings)):

1. **Enable external processing?** — on
2. **Enable proxy mode?** — on
3. **Enable chain recording?** — on
4. Set **Recording chain name** (`recordingName`) to your scenario segment (for example `fernando`)

Run a representative account-list aggregation against your tenant. Artifacts accumulate under `recordings/<tenant>/{scenarioName}/`.

### Replay and verify

```bash
npm run build

# Interactive replay with golden comparison
npm run replay -- "company1296-poc/my-scenario"

# Headless regression (CI-friendly)
npm run test-recording -- "company1296-poc/my-scenario"
```

| Command | Use when |
| --- | --- |
| `npm run replay` | Interactive debugging with live connector output |
| `npm run test-recording` | Fast headless regression before commit or in CI |
| `npm run finalize -- "tenant/scenario"` | Recover `scenario.json` after an unclean exit |

Replay serves all ISC calls from `api-log.ndjson` — no live tenant API calls during verification.

### Harness unit tests (no recordings required)

```bash
npm test -- src/operations/__tests__/scenario/chain.replay.test.ts
npm test -- src/operations/__tests__/scenario/orchestrator.integration.test.ts
```

These validate the replay adapter, step orchestration, and golden comparison logic using in-repo fixtures.

### `reports/matching-results.json` schema

Written after record-mode account-list completes:

- `version`, `recordedAt`, `operation` — artifact metadata
- `sweepSummary` — `{ processed, exact, partial, deferred, nonMatch }` counts
- `identityMatches` — identity-origin matches with candidate scores
- `deferredMatches` — deferred candidate rows with per-attribute scores
- `nonMatches` — analyzed non-match accounts
- `failedMatches` — accounts where matching failed

Record mode automatically enables managed-account report capture. Scenarios recorded before this artifact existed must be re-recorded.

## Dry-run validation (pre-production)

Before changing Match thresholds or source settings in production, run a [dry-run](../../operations/dry-run.md) against a representative sample (100–500 managed accounts is a practical starting point):

```json
{
  "dryRun": {
    "enabled": true,
    "saveFile": true
  }
}
```

Review the HTML report under `./reports/` for potential matches, score breakdowns, and issue summaries. Dry-run performs no write side effects.

## Required assertions (regression checklist)

When validating a scenario or fixture after configuration changes:

- Sweep 1 should create potential/candidate matching state without over-correlation.
- Sweep 2 (when present) should apply submitted review decisions deterministically.
- Correlation and non-match counts should be stable across replays.
- Disable side effects for orphan sources should match recorded expectations.
- Single-account operation tests remain isolated from account-list lifecycle tests.

## Related resources

| Topic | Resource |
| --- | --- |
| Scenario artifact reference | [Scenario recording](../../reference/scenario-recording.md) |
| Dry-run tuning workflow | [Dry-run analysis](../operation/dry-run-analysis.md) |
| Source and scope setup | [Configuring sources and scope](../configuration/configuring-sources-and-scope.md) |
| Troubleshooting common issues | [Troubleshooting](troubleshooting.md) |
