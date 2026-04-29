# Dry Run Operation (`custom:dryrun`)

## Description

The `custom:dryrun` operation runs a non-persistent aggregation analysis. It executes the same setup, fetch, and matching analysis pipeline used by account aggregation, but it does not execute persistence/writeback paths.

## Process Flow

1. **PHASE 1 – Setup and initialization**: Same as `std:account:list` setup phase (sources, schema, counters). If a reset flag is detected the operation aborts early.
2. **PHASE 2 – Fetch data in parallel**: Loads fusion accounts, identities, managed accounts, and form data concurrently.
3. **PHASE 3 – Refresh**: Refreshes existing fusion accounts with latest source data.
4. **PHASE 4 – Process**: Processes identities, managed accounts, and form reconciliation — the full matching and scoring pipeline runs here. No state is persisted and no external API side-effects are triggered (`isPersistent = false`).
5. **PHASE 5 – Output preparation**: Runs the unique attribute phase and assembles the dry-run output rows.
6. **PHASE 6 – Output**: Streams enriched ISC account rows (filtered by `include*` flags) followed by a final `custom:dryrun:summary` object. If `writeToDisk: true`, rows and summary are written as pretty-printed JSON under `./reports` instead of being streamed; only the summary is returned.

Phases 5–6 are dry-run-specific replacements for the standard `uniqueAttributesPhase`, `outputPhase`, and `reportPhase` used by `std:account:list`. No account writes, state saves, or external report emails are triggered.

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
