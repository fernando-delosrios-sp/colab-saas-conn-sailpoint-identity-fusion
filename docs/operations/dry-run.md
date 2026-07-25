# Dry-run mode (account list)

## Description

Dry-run mode is a **non-persistent** variant of the [Account list](account-list.md) operation (`std:account:list`). It runs the full Map, Define, and Match pipeline in memory so you can analyze outcomes before changing production data.

Dry-run mode is activated by passing a `dryRun` object on the account-list input. It is intended for **local or out-of-platform execution** (for example `spcx`, proxy server, or connector development). ISC platform aggregations do not send this input, so scheduled aggregations remain persistent.

The former `custom:dryrun` command has been removed. Use dry-run mode on `std:account:list` instead.

## When to use it

| Use case | Why dry-run |
| -------- | ----------- |
| Tune Match thresholds and algorithms | See potential matches and score breakdowns in the HTML report without creating forms or updating accounts |
| Validate source ordering and attribute mapping | Confirm Map/Define output and `originSource` behavior before a production aggregation |
| Review correlation and matching context | Inspect managed-account counts, issue summaries, and phase timing without side effects |
| Large-tenant analysis | Use `saveFile: true` to write the HTML report to disk when the HTTP response is not the primary deliverable |

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
| ------ | ---- | ------- | ----------- |
| `enabled` | boolean | `false` | Set to `true` to run in non-persistent dry-run mode. |
| `saveFile` | boolean | `false` | Write an HTML report to `./reports/dry-run-<host>-<timestamp>.html` on the connector host. |
| `sendEmail` | string or string[] | — | Deliver the dry-run report email to the specified address(es). |

When `enabled` is `false` or absent, the operation runs as a normal persistent aggregation and `saveFile` / `sendEmail` are silently ignored.

## Process flow

Dry-run reuses the same pipeline phases as a persistent aggregation through Process (phases 1–4). Output and persistence differ.

```mermaid
flowchart TD
    Start([std:account:list with dryRun.enabled]) --> Setup[1. Setup — no process lock]
    Setup --> Fetch[2. Fetch — no delayed-aggregation sender]
    Fetch --> Refresh[3. Refresh fusion accounts]
    Refresh --> Process[4. Process — no correlation PATCH, no orphan disable]
    Process --> Output[5. Output — skip account streaming and state save]
    Output --> Epilogue[Epilogue — HTML report and/or email, then terminal summary]
    Epilogue --> End([End])
```

### What runs (same as aggregation)

- Managed source and identity fetch
- Fusion account refresh (Map + normal Define)
- Identity processing and managed-account matching (Match)
- In-memory form reconciliation for report context
- Global unique attribute refresh logic inside the processing pipeline

### What is suppressed (no write side effects)

| Side effect | Persistent aggregation | Dry-run |
| ----------- | ---------------------- | ------- |
| Process lock | Acquired | Skipped |
| Stream Fusion accounts to ISC | Yes | No |
| Save attribute / batch state | Yes | No |
| Form cleanup and form API writes | Yes | No |
| Correlation-on-aggregation PATCH calls | Yes (when configured) | No |
| Orphan disable operations | Awaited and executed | Skipped |
| Delayed-aggregation workflow fetch and scheduling | Yes (when configured) | No |
| Reset forms / reset accounts flags | Applied when set | Detected but not applied |

!!! note "Reset flags in dry-run"
    If **Reset accounts?** or **Reset forms?** is enabled, dry-run detects the flag and exits early without applying the reset or streaming accounts. Use a persistent aggregation (or clear the flag) when you intend to perform a reset.

## Output

### Terminal summary

The final `res.send` call is a summary object:

| Field | Description |
| ----- | ----------- |
| `rowsSent` | Always `0` in dry-run (accounts are not streamed to the platform) |
| `identitiesFound` | Identities loaded during fetch |
| `managedAccountsFound` | Managed accounts loaded during fetch |
| `totalProcessingTime` | Total elapsed time for the run |
| `phaseTiming` | Per-phase elapsed breakdown |
| `issueSummary` | Warning and error counts with sampled messages |
| `options` | `{ saveFile, sendEmail }` reflecting the input used |

### HTML report (`saveFile` or `sendEmail`)

When `saveFile` and/or `sendEmail` is set, the connector generates a report using the **same Handlebars template and section layout** as the aggregation report-on-aggregation email. The title is **Identity Fusion Dry Run Report** to distinguish analysis from persisted results.

Report contents align with the [Account list report section](account-list.md#report-contents-what-is-included):

- Header summary and processing statistics
- Potential match details with candidate score breakdowns
- Failed matching / form creation entries
- Global warnings (for example duplicate Fusion accounts per identity)
- Compact aggregation issues summary (counts + sampled messages, not full logs)

Non-match detail appears as **consolidated counters** in the report (`includeNonMatches: false`), not as per-account non-match rows.

### Epilogue ordering (durable-first)

When report artifacts are requested, the epilogue runs in this order:

1. Write HTML report file (`saveFile`)
2. Deliver report email (`sendEmail`)
3. Send terminal summary via `res.send` (always last)

The epilogue runs **even when the pipeline fails** partway through, so report files and emails are attempted before the operation error is propagated.

## Invocation examples

### Local development (`spcx`)

Build the connector, then run it locally and invoke account list with dry-run input in your spcx session or test harness:

```bash
npm run build
npm run dev
```

Pass `{ "dryRun": { "enabled": true, "saveFile": true } }` on the `std:account:list` input together with your connector configuration.

### Proxy mode

When the proxy server receives `std:account:list`, include the `dryRun` object in the `input` payload. For large tenants, prefer `saveFile: true` so the HTML report is written on the server filesystem rather than relying on the full HTTP response stream.

See [Proxy mode](../guides/proxy-mode.md) for architecture and setup.

## Migration from `custom:dryrun`

| Before (`custom:dryrun`) | After (`std:account:list`) |
| ------------------------ | -------------------------- |
| Separate command | `{ dryRun: { enabled: true } }` on account-list input |
| `writeToDisk` | `saveFile: true` |
| `sendReportTo` | `sendEmail: ["address@example.com"]` |
| `includeExisting`, `includeMatched` | Removed — full pipeline always runs; detail is in the HTML report |
| Enriched output rows (`matchingStatus`, `reportCategories`, `review`) | Removed — use the HTML report and terminal summary |

## Related documentation

- [Account list operation](account-list.md) — full persistent aggregation flow
- [Match guide](../guides/match.md) — tuning thresholds; includes a dry-run workflow note
- [Matching algorithms](../guides/matching-algorithms.md) — recommended testing approach
- [Glossary: dry-run mode](../concepts/glossary.md) — canonical term definition
