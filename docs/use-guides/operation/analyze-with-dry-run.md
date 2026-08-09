# Analyze changes with dry-run

Use this guide when you need to **validate Match or mapping changes before persisting them to the tenant** — tune thresholds, inspect score breakdowns, and review outcomes without write side effects.

**Operation reference:** [Dry-run mode (account list)](../../operations/dry-run.md) · **Match tuning:** [Match tuning cookbooks](../configuration/match-tuning-cookbooks.md) · [Tuning matching algorithms](../configuration/tuning-matching-algorithms.md)

!!! note "Didactic guide"
    This page explains **when and how** to run dry-run analysis. For input fields, process flow, and output schema, see [Dry-run mode (account list)](../../operations/dry-run.md).

---

## When you need this

| Situation | Why dry-run |
| --- | --- |
| Changing Match thresholds or algorithms | See potential matches and score breakdowns without mutating the tenant |
| Validating source ordering or attribute mapping | Confirm Map/Define output and `originSource` before production aggregation |
| Reviewing correlation context | Inspect managed-account counts, issue summaries, and phase timing |
| Large tenant | Use `saveFile: true` so the HTML report is written to disk on the connector host |

Dry-run runs the full Map, Define, and Match pipeline against live ISC **read** APIs. Write side effects are suppressed at the API adapter boundary — business logic is identical to a persistent aggregation.

!!! warning "Platform note"
    Dry-run is activated by passing `dryRun` on the `std:account:list` input. ISC scheduled aggregations do not send this input — use `spcx`, a test harness, or proxy mode for dry-run runs.

---

## Workflow: run a dry-run

### 1. Choose invocation path

| Path | When to use |
| --- | --- |
| **Local (`spcx`)** | Development; connector built and running locally |
| **Proxy server** | Large tenants; report written to server filesystem |

Build the connector first:

```bash
npm run build
npm run dev   # spcx with source maps
```

Pass dry-run input on `std:account:list` together with your connector configuration. On proxy, include the `dryRun` object in the `input` payload — see [Run the connector via proxy](run-via-proxy.md).

### 2. Set dry-run input

Recommended starting point for Match tuning (100–500 managed accounts is a practical sample):

```json
{
  "dryRun": {
    "enabled": true,
    "saveFile": true
  }
}
```

| Option | Default | Purpose |
| --- | --- | --- |
| `enabled` | `false` | Set `true` for non-persistent analysis |
| `saveFile` | `false` | Write HTML report to `./reports/dry-run-<host>-<timestamp>.html` |
| `sendEmail` | — | Deliver the dry-run report email |

Full field reference: [Dry-run mode — Input options](../../operations/dry-run.md#input-options).

### 3. Review the HTML report

When `saveFile` or `sendEmail` is set, the connector generates **Identity Fusion Dry Run Report** using the same template as the aggregation report:

- Header summary and processing statistics
- Potential match details with candidate score breakdowns
- Failed matching / form creation entries
- Global warnings (for example duplicate Fusion accounts per identity)
- Compact issue summary

Reports are written under `./reports/` on the connector host. Review match outcomes before changing production thresholds.

### 4. Review the console run summary

After the run completes, the connector logs a JSON summary to `console.log` with `rowsSent`, identity/managed/fusion account totals, `issueSummary`, timing, and report paths when applicable.

---

## Workflow: tie-in to Match tuning

Typical loop when tuning Match:

1. Run dry-run with current configuration and `saveFile: true`
2. Review potential matches and score breakdowns in the HTML report
3. Adjust thresholds in [Attribute Matching Settings](../../configuration/matching.md)
4. Re-run dry-run and compare reports
5. When satisfied, run a persistent aggregation in ISC

See [Match tuning cookbooks](../configuration/match-tuning-cookbooks.md) for scenario-specific workflows.

---

## Reset flags and dry-run

If **Reset accounts?** or **Reset forms?** is enabled, dry-run detects the flag and exits early without applying the reset or streaming accounts. Clear reset flags or use a persistent aggregation when you intend to perform a reset — see [Reset Fusion state](reset-fusion-state.md).

Dry-run cannot be combined with recording mode (`recording.mode: record` or `replay`).

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No HTML report | `saveFile: true` set; check `./reports/` on connector host |
| Dry-run exits immediately | Reset flags enabled — clear in Developer Settings |
| Results differ from production | Dry-run uses live read state; tenant may have changed since last aggregation |
| Recording + dry-run conflict | Use one mode at a time |

---

## Related guides

| Topic | Resource |
| --- | --- |
| Input/output schema and process flow | [Dry-run mode (account list)](../../operations/dry-run.md) |
| Scenario recording for regression | [Capture scenarios for replay](capture-scenarios-for-replay.md) |
| Pre-release validation checklist | [Testing and validation](../validation-and-troubleshooting/testing-and-validation.md) |

