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

Before changing Match thresholds or source settings in production, run a [dry-run](../operations/dry-run.md) against a representative sample (100–500 managed accounts is a practical starting point):

```json
{
  "dryRun": {
    "enabled": true,
    "saveFile": true
  }
}
```

Review the HTML report under `./reports/` for potential matches, score breakdowns, and issue summaries. Dry-run performs no write side effects, so it is safe to repeat while iterating on configuration.

## Required assertions

- Sweep1 should create potential/candidate matching state without over-correlation.
- Sweep2 should apply submitted decisions deterministically.
- Correlation/non-matched counts and disable side effects should be stable for each run.
- Single-account operation tests remain isolated from accountList lifecycle tests.

