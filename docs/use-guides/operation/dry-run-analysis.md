# Dry-run analysis

`std:account:list` supports an optional dry-run mode for **non-persistent aggregation analysis**. Pass `{ dryRun: { enabled: true } }` on the input to run the full Map, Define, and Match pipeline without persisting state changes, form updates, or aggregation scheduling. The pipeline is identical to a real aggregation, so deferred totals and other analysis align with production runs.

## Input options

Pass a `dryRun` object on the `std:account:list` input:

```json
{
  "dryRun": {
    "enabled": true,
    "saveFile": true,
    "sendEmail": ["reviewer@example.com"]
  }
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Set to `true` to run in non-persistent dry-run mode. |
| `saveFile` | boolean | `false` | Write the terminal summary and HTML report to `./reports/dry-run-<host>-<timestamp>.json` and `.html`. |
| `sendEmail` | string or string[] | — | Deliver the dry-run report to the specified email address(es). |

When `enabled` is `false` or absent, the operation runs as a normal persistent aggregation and `saveFile`/`sendEmail` are silently ignored.

## What it returns

- Sends a terminal summary object via `res.send` containing: `rowsSent`, `identitiesFound`, `managedAccountsFound`, `totalProcessingTime`, `phaseTiming`, `issueSummary`, and the `options` used for the run.
- When `saveFile` is `true`, an HTML report is written to `./reports/` before the terminal summary (durable-first ordering).
- When `sendEmail` is set, the HTML report is delivered via email before the terminal summary. The email uses the same Handlebars template and section layout as the aggregation report, titled **Identity Fusion Dry Run Report**.

## Migration from `custom:dryrun`

The `custom:dryrun` command has been removed. Replace invocations:

- **Before:** `custom:dryrun` with `includeExisting`, `includeMatched`, `writeToDisk`, `sendReportTo`, etc.
- **After:** `std:account:list` with `{ dryRun: { enabled: true, saveFile: true, sendEmail: [...] } }`

Output rows no longer carry `matchingStatus` / `reportCategories` / `review` payloads. Match analysis detail lives in the HTML report and terminal summary.

## Typical use cases

- Tune Match thresholds and algorithms before production changes.
- Validate source ordering and account provenance (`originSource`) behavior.
- Inspect correlated vs non-correlated outcomes without persisting state changes.
