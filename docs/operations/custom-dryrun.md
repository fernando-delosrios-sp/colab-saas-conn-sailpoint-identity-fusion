# Dry Run Operation (`custom:dryrun`)

## Description

The `custom:dryrun` operation runs a non-persistent aggregation analysis. It executes the same setup, fetch, and matching analysis pipeline used by account aggregation, but it does not execute persistence/writeback paths.

## Process Flow

1. **Execution**:
   - Invoked as custom command `custom:dryrun`.
   - Reuses the same core processing phases used by aggregation for consistency.
   - Runs in analysis-only mode (no persistent state or writeback updates).

2. **Output**:
   - Emits account rows based on enabled `include*` flags.
   - Always emits a final `custom:dryrun:summary` object with totals, emitted counts, options, and diagnostics.
   - Optional `writeToDisk: true` writes report payload (`rows` + `summary`) to a file and returns summary metadata including the output path.

## Input Options

All row inclusion flags default to `false`:

- `includeExisting`
- `includeNonMatched`
- `includeMatched`
- `includeExact`
- `includeDeferred`
- `includeReview`
- `includeDecisions`
- `writeToDisk`

`summary` is always included in the response.
