# Scenario Data Workflow

This folder supports data-driven two-pass scenario execution for connector testing.

## Layout

- `test-data/scenarios/<scenario-id>/scenario.manifest.json`
- `test-data/scenarios/<scenario-id>/config.json`
- `test-data/scenarios/<scenario-id>/identities.json`
- `test-data/scenarios/<scenario-id>/managedAccounts.pass1.json`
- `test-data/scenarios/<scenario-id>/forms.pass1.json`
- `test-data/scenarios/<scenario-id>/managedAccounts.pass2.json`
- `test-data/scenarios/<scenario-id>/forms.pass2.json`

Manifest schema:

- `test-data/scenarios/schemas/scenario.manifest.schema.json`

## Run a scenario

```bash
node test-data/scenarios/scenarioRunner.js "test-data/scenarios/std-account-list-001"
```

## Generated files

The runner writes (or updates) generated outputs:

- `output.pass1.generated.json`
- `output.pass2.generated.json`
- `sideEffects.pass1.generated.json`
- `sideEffects.pass2.generated.json`

If expected files do not exist yet, they are initialized:

- `output.pass1.expected.json`
- `output.pass2.expected.json`

## Decision data format (forms.pass2.json)

Submitted review decisions should include:

- `formInput.account` -> managed account `id`
- `formData.newIdentity` -> `false` to correlate, `true` to reject-match/create-new
- `formData.identities[0]` -> selected identity ID when `newIdentity` is `false`

## Notes

- Use realistic but sanitized data samples.
- Keep account IDs stable between managed account files and decision files.
- Use one scenario per folder for easy review and diffs.
- Keep `operation` set to `std:account:list` for two-pass aggregation scenarios.
