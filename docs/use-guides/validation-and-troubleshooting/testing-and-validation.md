# Data-driven testing process

This connector test process uses two-sweep account aggregation scenarios with reusable JSON data files.

## Goals

- Keep test inputs editable by humans (JSON files).
- Re-run sweep1/sweep2 deterministically with the same data.
- Capture generated outputs and side effects for review.

## Scenario structure

Each scenario lives under `test-data/scenarios/<scenario-id>/` and includes:

- `scenario.manifest.json`
- `config.json`
- `identities.json`
- `managedAccounts.sweep1.json`
- `forms.sweep1.json`
- `managedAccounts.sweep2.json`
- `forms.sweep2.json`

Generated artifacts:

- `output.sweep1.generated.json`
- `output.sweep2.generated.json`
- `sideEffects.sweep1.generated.json`
- `sideEffects.sweep2.generated.json`

Expected golden artifacts:

- `output.sweep1.expected.json`
- `output.sweep2.expected.json`

## Execution

Run tests:

```bash
npm test -- src/operations/__tests__/accountList.test.ts src/services/fusionService/__tests__/fusionService.test.ts
```

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

Review the HTML report under `./reports/` for potential matches, score breakdowns, and issue summaries. Dry-run performs no write side effects, so it is safe to repeat while iterating on configuration.

## Chain recording artifacts

Dev recordings under `recordings/{chainName}/` (see README chain recording section) persist offline replay data:

| File | When written | Contents |
| --- | --- | --- |
| `api-log.ndjson` | During operation | ISC API request/response pairs for replay |
| `steps.ndjson` | Per operation step | Inputs, outputs, and `FusionRun` state snapshots |
| `phases.ndjson` | Account-list phases | Phase boundaries with elapsed time and counts |
| `scenario.json` | Process exit | Compiled replay scenario with config and goldens |
| `manifest.json` | Process exit | Store type, artifact paths, entry counts |
| `reports/aggregation.json` | Report epilogue (when enabled) | Aggregation report payload |
| `reports/matching-results.json` | Report epilogue (record mode) | Match outcomes with score breakdowns |

### `reports/matching-results.json` schema

Written after record-mode account-list completes. Top-level fields:

- `version`, `recordedAt`, `operation` — artifact metadata
- `sweepSummary` — `{ processed, exact, partial, deferred, nonMatch }` counts
- `identityMatches` — identity-origin matches with candidate scores
- `deferredMatches` — deferred candidate rows with per-attribute scores
- `nonMatches` — analyzed non-match accounts
- `failedMatches` — accounts where matching failed

Record mode automatically enables managed-account report capture so score breakdowns are populated. Chains recorded before this artifact was introduced must be re-recorded.

Tests may load matching results directly instead of re-running matching from `api-log.ndjson` (see `fernandoRecordingReplay.test.ts`).

## Required assertions

- Sweep1 should create potential/candidate matching state without over-correlation.
- Sweep2 should apply submitted decisions deterministically.
- Correlation/non-matched counts and disable side effects should be stable for each run.
- Single-account operation tests remain isolated from accountList lifecycle tests.


