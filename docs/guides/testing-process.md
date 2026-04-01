# Data-driven testing process

This connector test process uses two-pass account aggregation scenarios with reusable JSON data files.

## Goals

- Keep test inputs editable by humans (JSON files).
- Re-run pass1/pass2 deterministically with the same data.
- Capture generated outputs and side effects for review.

## Scenario structure

Each scenario lives under `test-data/scenarios/<scenario-id>/` and includes:

- `scenario.manifest.json`
- `config.json`
- `identities.json`
- `managedAccounts.pass1.json`
- `forms.pass1.json`
- `managedAccounts.pass2.json`
- `forms.pass2.json`

Generated artifacts:

- `output.pass1.generated.json`
- `output.pass2.generated.json`
- `sideEffects.pass1.generated.json`
- `sideEffects.pass2.generated.json`

Expected golden artifacts:

- `output.pass1.expected.json`
- `output.pass2.expected.json`

## Execution

Run the scenario runner:

```bash
node test-data/scenarios/scenarioRunner.js "test-data/scenarios/std-account-list-001"
```

Run tests:

```bash
npm test -- src/operations/__tests__/accountList.test.ts src/operations/__tests__/scenarioRunner.smokeMatrix.test.ts src/services/fusionService/__tests__/fusionService.test.ts
```

## Required assertions

- Pass1 should establish match and candidate state without over-correlation.
- Pass2 should apply submitted decisions deterministically.
- Correlation/unmatched counts and disable side effects should be stable for each run.
- Single-account operation tests remain isolated from accountList lifecycle tests.
