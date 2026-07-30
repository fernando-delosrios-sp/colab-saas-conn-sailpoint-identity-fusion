# Observability and log format

This reference describes connector log formats for monitoring, alerting, and external logging integrations. For configuration guidance, see [Connection and observability tuning](../use-guides/operation/connection-and-observability-tuning.md).

## External logging payload

Each log entry is a JSON object. Implementations should accept at least these fields (and may receive additional fields in the future):

| Field       | Type   | Required | Description                                                    |
| ----------- | ------ | -------- | -------------------------------------------------------------- |
| `level`     | string | Yes      | One of: `error`, `warn`, `info`, `debug`                       |
| `timestamp` | string | Yes      | ISO 8601 date-time (e.g. `2024-01-15T14:30:45.123Z`)           |
| `message`   | string | Yes      | Log message text                                               |
| `context`   | object | No       | Additional key-value context (e.g. `sourceId`, `accountCount`) |

**Example log structure:**

```json
{
    "level": "info",
    "timestamp": "2024-01-15T14:30:45.123Z",
    "message": "Account aggregation started",
    "context": {
        "sourceId": "fusion-source-123",
        "accountCount": 5420
    }
}
```

## Operation log line kinds (`accountList`)

During long `accountList` aggregations, the connector emits standardized text prefixes in log messages (prefixed with `[accountList]`). Config bootstrap messages use `[config]`. Use these for monitoring and alerting instead of legacy patterns.

| Prefix | Level | Purpose |
| ------ | ----- | ------- |
| `STATUS` | Info | Periodic heartbeat (default 10s, configurable via **Heartbeat interval**): phase, step, pipeline progress with delta, compact `api=Na/Nq/Nc` segment with delta (`q` = FIFO queue length plus requests waiting for a rate-limit slot), memory, elapsed time |
| `EVENT_SUMMARY` | Info | Aggregated match/decision/correlation/email counts since the previous heartbeat tick |
| `PHASE` / `STEP` | Info | Pipeline boundary markers (`START` / `END elapsed=…`) |
| `DETAIL` | Info | Operational milestones as `key=value` pairs (sources loaded, emails sent, mode) |
| `WARN STALL` | Warn | API queue stopped completing requests for two consecutive heartbeat ticks; includes active request labels |
| `EPILOGUE` | Info | Report epilogue (`START` / `END elapsed=…`; not a numbered phase) |
| `METRIC` | Info | Phase/step timing metrics |

## Log monitor migration

| Legacy pattern (removed) | Replace with |
| ------------------------ | ------------ |
| `Queue Stats:` | `STATUS` (`api=` segment inside STATUS lines) |
| `Memory usage` | `STATUS` (RSS/heap appear inside STATUS lines) |
| `PHASE N: Description (elapsed)` | `PHASE N Name END elapsed=…` |
| `Epilogue: report generation` | `EPILOGUE report END elapsed=…` |
| Per-account `MATCH FOUND:` / `Triggering correlation` at Info | `EVENT_SUMMARY` (per-account detail remains at Debug) |
| Per-account merge/new-identity decision prose at Debug only | Info headlines `… DECISION DISCOVERED` / `… DECISION APPLIED` plus `DETAIL` / `EVENT_SUMMARY decisions` |
| `correlations triggered=` in EVENT_SUMMARY / PHASE END | `correlations link=triggers/accounts merge=triggers/accounts` (see examples below) |
| Free-form `Loaded N managed source(s)` | `DETAIL sources=N` |

## Correlation activity format

Used in `EVENT_SUMMARY`, `PHASE END`, and Output/Epilogue `STATUS` lines:

- **Link** — correlation-on-aggregation PATCH during Refresh/Process: `correlations link=14/18`
- **Merge** — merge-decision-driven PATCH during Process: `merge=2/2`
- **Completed** — correlation PATCH resolved: `completed=+147/10s` (interval delta) or `completed=147` (cumulative)
- **Pending** — correlation PATCH still queued (Output/Epilogue STATUS): `pending=1853`
- **Skipped** — PATCH not attempted: `skipped=noIdentity=3,noSourceContext=2,noIscAccountId=1`

`correlated-action=` is reserved for non-aggregation operations (for example `accountUpdate` entitlement grants) and does **not** appear during `accountList`.

**Example grep targets:**

```bash
grep 'EVENT_SUMMARY correlations' connector.log
grep 'PHASE 4 Process END correlations link=' connector.log
grep 'correlations merge=' connector.log
grep 'correlations.*completed=' connector.log
grep 'pending=' connector.log
```

## Match outcome segment

Compact counters mirror match discovery during Process phase (`STATUS`, `DETAIL`, `PHASE END`):

`matches(5n/2m/4a/1d)`

| Token | Meaning |
| ----- | ------- |
| `n` | Non-match outcomes |
| `m` | Manual review forms queued |
| `a` | Automatic merges applied |
| `d` | Deferred matches discovered |

When `total=` is present (for example on phase-complete `DETAIL` lines), it is the sum of all four counts.

## Decision outcome segment

Reviewer and automatic merge decisions use the same compact style (`STATUS`, `DETAIL`, `PHASE END`, `EVENT_SUMMARY`):

`decisions(1n/1m/0nm/0a)`

| Token | Meaning |
| ----- | ------- |
| `n` | **New identity** — reviewer chose to create a new identity (authoritative source) |
| `m` | **Merge** — reviewer chose to merge into an existing identity |
| `nm` | **No-match** — reviewer confirmed no match (record/orphan sources) |
| `a` | **Auto-merge** — system merged without review (exact-match threshold) |

## Decision headline lines (Info)

Each finished review form emits a discovery line during Fetch; applied lines appear when the decision takes effect:

| Headline | When logged | Example |
| -------- | ----------- | ------- |
| `MERGE DECISION DISCOVERED` | Fetch — form parsed | `MERGE DECISION DISCOVERED: Sergei Vladimir [Umbrella Corporation] → Albert Wesker by Chris Redfield` |
| `NEW IDENTITY DECISION DISCOVERED` | Fetch — form parsed | `NEW IDENTITY DECISION DISCOVERED: New User [Umbrella Corporation] by Chris Redfield` |
| `NO-MATCH DECISION DISCOVERED` | Fetch — record/orphan no-match | `NO-MATCH DECISION DISCOVERED: Record User [HR] by Reviewer (record)` |
| `MERGE DECISION APPLIED` | Refresh — merge layered onto target fusion account | `MERGE DECISION APPLIED: … → merged into target identity` |
| `NEW IDENTITY DECISION APPLIED` | Process — new fusion account registered | `NEW IDENTITY DECISION APPLIED: … → registered as fusion account` |
| `AUTO-MERGE DECISION APPLIED` | Process — automatic merge from scoring | `AUTO-MERGE DECISION APPLIED: … → merged into target identity` |

Merge decisions are **discovered** in Phase 2 (Fetch) and **applied** in Phase 3 (Refresh). New-identity decisions are **discovered** in Phase 2 and **applied** in Phase 4 (`STEP process-decisions`).

**Decision EVENT_SUMMARY format:**

`EVENT_SUMMARY decisions new-identity=+1/10s merge=+1/10s`

Interval deltas use the same `+N/seconds` pattern as match summaries. The legacy `EVENT_SUMMARY forms new-identity-assignment=N` line remains for backward-compatible monitors.

**Example grep targets:**

```bash
grep 'DECISION DISCOVERED' connector.log
grep 'DECISION APPLIED' connector.log
grep 'EVENT_SUMMARY decisions' connector.log
grep 'DETAIL.*decisions=' connector.log
grep 'decisions(' connector.log
```

**General grep targets:** `STATUS`, `WARN STALL`, `EVENT_SUMMARY`, `PHASE 4 Process START`, `DETAIL`
