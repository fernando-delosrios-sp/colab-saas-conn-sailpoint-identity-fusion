# Observability and log format

This reference describes connector log formats for monitoring, alerting, and external logging integrations. For configuration guidance, see [Monitor aggregation progress](../use-guides/operation/monitor-aggregation-progress.md) and [Tune API performance](../use-guides/operation/tune-api-performance.md).

## External logging delivery

Routing depends on connector role (see `resolveExternalLogRoute` in the connector):

| Role | Route | Destination |
| --- | --- | --- |
| Direct ISC, logging on | `http` | HTTP POST to **External target URL** |
| Proxy client (ISC) | `noop` | No external delivery — server owns logs |
| Proxy server, logging on | `disk` | Append to `LOG_FILE` or `logs/<tenant>/fusion-{YYYYMMDD}.log` |

### Plain-text line format

Each log entry is a **plain-text line** sent with `Content-Type: text/plain` (HTTP mode) or appended to disk (proxy server mode):

```
HH:MM:SS [LEVEL]  [operation] message body…
```

**Example:**

```
14:30:45 [INFO]  [accountList] STATUS phase=4 step=process progress=1200/5400 api=42/3/891 elapsed=183s
14:30:45 [INFO]  [accountList] EVENT_SUMMARY matches non-match=+12/10s decisions merge=+1/10s
14:30:55 [WARN]  [accountList] WARN STALL api-queue idle=20s active=GET /v3/accounts?…
```

Optional HTTP header `x-fusion-baseurl` carries the ISC connection base URL so multi-tenant receivers can route lines.

### Log levels

External logging respects **External logging level** (Error, Warn, Info, Debug). ISC debug logging (`spConnDebugLoggingEnabled`) is separate and does not replace external delivery.

### Local HTTP receiver

For development, the repo includes `log-server.js`:

```bash
mkdir -p logs
LOG_FILE=logs/remote-logs-$(date +%Y%m%d).log npm run log-server
```

Point **External target URL** (with proxy mode off) at `http://your-host:3000/`. The receiver accepts POST bodies as plain text and appends to `LOG_FILE`.

## Operation log line kinds (`accountList`)

During long `accountList` aggregations, the connector emits standardized text prefixes in log messages (prefixed with `[accountList]`). Config bootstrap messages use `[config]`. Use these for monitoring and alerting instead of legacy patterns.

| Prefix | Level | Purpose |
| ------ | ----- | ------- |
| `STATUS` | Info | Periodic heartbeat (default 10s, configurable via **Heartbeat interval**): phase, step, pipeline progress with delta, compact `api=Na/Nq/Nc` segment with delta (`q` = FIFO queue length plus requests waiting for a rate-limit slot), memory, elapsed time |
| `EVENT_SUMMARY` | Info | Interval deltas for review/merge matches, decisions, correlations, and emails. Omitted when the tick only recorded non-matched accounts — that work is already on `STATUS` as progress delta plus cumulative `matches(` |
| `PHASE` / `STEP` | Info | Pipeline boundary markers (`START` / `END elapsed=…`) |
| `DETAIL` | Info | Operational milestones as `key=value` pairs (sources loaded, emails sent, mode) |
| `WARN STALL` | Warn | API queue stopped completing requests for two consecutive heartbeat ticks; includes active request labels |
| `WARN EVENT_LOOP` | Warn | The event loop was blocked long enough to starve keep-alive and heartbeat timers; reports the blocked duration plus the phase/step on both sides of the gap, and a worst-block summary when the operation ends |
| `EPILOGUE` | Info | Report epilogue (`START` / `END elapsed=…`; not a numbered phase) |
| `METRIC` | Info | Phase/step timing metrics |

### STATUS progress units

The `progress=done/total unit` segment distinguishes the kind of pipeline work:

- `fetched` — HTTP pages retrieved from ISC.
- `ingested` — already-fetched identity documents or Fusion accounts registered into operation-run caches.
- `refreshed` — Fusion accounts visited during the Refresh phase.
- Other phase-specific units such as `processed`, `analyzed`, or `sent` describe Process and Output work.

Bulk ingest remains in the Fetch phase but uses `ingested` so operators can distinguish API retrieval from CPU-bound cache registration. The first STATUS tick after a unit change omits the delta; later ticks show the interval delta normally. Ingest start may also emit `DETAIL action=ingesting identities count=N` or `DETAIL action=ingesting fusion-accounts count=N`. There is no separate `INGEST` line kind.

Refresh follows the same single-unit shape as Fetch: `progress=19032/102407 refreshed(Δ+192/10s)`. It does not add a separate `refreshed(N)` cumulative segment.

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

**General grep targets:** `STATUS`, `WARN STALL`, `WARN EVENT_LOOP`, `EVENT_SUMMARY`, `PHASE 4 Process START`, `DETAIL`

## Silent runs and platform resets

When the platform resets an aggregation after a period with no log output, the cause is almost always a blocked event loop: keep-alive and `STATUS` are both timers, so neither can fire while synchronous work runs. Search the run for `WARN EVENT_LOOP` — the `before=` segment names the phase, step, and progress counter that was active when output stopped, which is the code path that needs to yield.

```bash
grep 'WARN EVENT_LOOP' connector.log
```

Because samples cannot run during the block, each warning appears only once the loop recovers. If the platform terminates the run before that, the gap between the last `STATUS` timestamp and the reset marks the same window.

`WARN EVENT_LOOP` is written twice: once through the normal logger, and once straight to stdout as plain text. A blocked loop also stops the logger draining its buffer, so the plain-text copy can be the only one that survives. A line present in raw form but missing from the structured log points at the logging pipeline rather than the loop.
