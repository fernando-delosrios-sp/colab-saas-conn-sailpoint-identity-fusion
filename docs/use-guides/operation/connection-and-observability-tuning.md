# Effective Use of Advanced Connection Settings

Advanced Settings provide fine-grained control over API behavior, resilience, performance, and observability for the Identity Fusion NG connector. This comprehensive guide covers **Developer Settings**, **Advanced Connection Settings**, and how they integrate with base **Connection Settings** for optimal connector operation.

---

## Overview and structure

Advanced Settings are organized into three sections:

| Section                          | Purpose                                                         | When to configure                                                  |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Developer Settings**           | Reset accounts, external logging                                | Testing, troubleshooting, centralized monitoring                   |
| **Advanced Connection Settings** | API behavior: queue, retry, timeouts, concurrency | Production tuning, rate limit management, performance optimization |
| **Proxy Settings**               | Delegate processing to external server                          | Custom deployment requirements (see [Proxy mode](../../reference/proxy-mode.md))   |

**Screenshot placeholder:** Advanced Settings menu interface.

![Advanced Settings menu - Overview](../../assets/images/advanced-settings-menu.png)

<!-- PLACEHOLDER: Screenshot of Advanced Settings with Developer and Advanced Connection sections. Save as docs/assets/images/advanced-settings-menu.png -->

---

## Part 1: Developer Settings

Developer Settings provide tools for testing, troubleshooting, and monitoring.

### Configuration fields

| Field                                            | Type     | Purpose                                                                                        | Default                                                | Risk level                                    |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| **Reset accounts?**                              | Boolean  | Clear Fusion account data and emit zero accounts on the next aggregation (rebuild on the following run) | No                                                     | ⚠️ **HIGH** — Deletes all Fusion account data |
| **Reset forms?**                                 | Boolean  | Delete all Fusion review form definitions on the next aggregation                                       | No                                                     | Medium — removes pending and completed review forms |
| **Managed accounts batch size**                  | Number   | Number of uncorrelated managed accounts per batch                                              | 100                                                    | Low                                           |
| **Force attribute refresh on next aggregation?** | Boolean  | Recalculate Normal-type attributes on the next aggregation only (auto-disabled after that run) | No                                                     | Medium                                        |
| **Enable concurrency check?**                    | Boolean  | Prevent concurrent aggregations                                                                | Yes                                                    | Low                                           |
| **Enable external logging?**                     | Boolean  | Send connector logs to external endpoint                                                       | No                                                     | Low                                           |
| **External logging URL**                         | URL      | Endpoint for external log aggregation                                                          | None                                                   | Low (if endpoint secured)                     |
| **External logging level**                       | Dropdown | Minimum log level to send                                                                      | None                                                   | Low                                           |

**Screenshot placeholder:** Developer Settings interface.

![Developer Settings - Configuration](../../assets/images/advanced-settings-developer.png)

<!-- PLACEHOLDER: Screenshot of Developer Settings. Save as docs/assets/images/advanced-settings-developer.png -->

### Reset accounts

**Purpose:** Force complete rebuild of Fusion account data.

**What it does:**

- Clears persisted Fusion account state (attributes, history, processing flags)
- Emits zero accounts on the reset run; the following aggregation rebuilds from scratch
- Does NOT delete source accounts, identities, or review forms (unless **Reset forms?** is also enabled)
- Automatically turns off after one aggregation

### Reset forms

**Purpose:** Delete all Fusion review form definitions without wiping account data.

**What it does:**

- Removes all Fusion review form definitions (pending and completed)
- Aggregation continues normally unless **Reset accounts?** is also enabled
- Automatically turns off after one aggregation

**Combined behavior:**

| Reset accounts? | Reset forms? | Result |
| ---------------- | ------------ | ------ |
| No | No | Normal aggregation |
| Yes | No | Account reset only — zero accounts emitted |
| No | Yes | Forms deleted — aggregation continues |
| Yes | Yes | Forms deleted, then account reset — zero accounts emitted |

**When to use reset accounts:**

| Scenario                                      | Use Reset accounts? | Alternative                                    |
| --------------------------------------------- | ------------------- | ---------------------------------------------- |
| Testing major config changes                  | Yes (once)          | Test with small batch first                    |
| Schema changes (attribute mapping/definition) | Maybe               | Discover Schema usually sufficient             |
| Stuck processing state                        | No                  | Retry aggregation (auto-resets the stuck flag) |
| Production environment                        | ⚠️ **Rarely**       | High impact; requires careful planning         |

**Workflow (account reset):**

```
1. Enable "Reset accounts?" = Yes (and "Reset forms?" = Yes if you also need forms cleared)
2. Save configuration
3. Run account aggregation (reset run emits zero accounts)
4. Run aggregation again to rebuild accounts
5. Flags auto-disable after the run that consumed them
```

!!! warning

    - **Data loss:** Account reset deletes Fusion account history, processing state, and custom attributes
    - **Forms-only reset:** Managed accounts held by pending forms re-enter Match on the same run
    - **Performance:** Full rebuild can take hours for large datasets (10k+ accounts)
    - **Identity impact:** If Fusion is authoritative, identities may be temporarily impacted
    - **Coordination:** Notify stakeholders before resetting in production

### External logging

**Purpose:** Send connector logs to external logging service for centralized monitoring, analysis, and alerting.

**Configuration:**

| Field                        | Value                             | Notes                                                          |
| ---------------------------- | --------------------------------- | -------------------------------------------------------------- |
| **Enable external logging?** | Yes                               | Activates external logging                                     |
| **External logging URL**     | `https://logs.example.com/fusion` | Your log aggregation endpoint (e.g., Splunk HEC, Datadog, ELK) |
| **External logging level**   | Info                              | Error, Warn, Info, or Debug                                    |

**Log levels:**

| Level     | What gets logged                           | Use when                        |
| --------- | ------------------------------------------ | ------------------------------- |
| **Error** | Critical errors only                       | Production; minimal logging     |
| **Warn**  | Errors + warnings                          | Production; monitor issues      |
| **Info**  | Errors + warnings + informational messages | Production; standard monitoring |
| **Debug** | All logs including debug details           | Troubleshooting; verbose        |

**Use cases:**

| Use case                  | Configuration       | Benefit                                     |
| ------------------------- | ------------------- | ------------------------------------------- |
| **Production monitoring** | Enable, Info level  | Track aggregation operations, errors, performance |
| **Troubleshooting**       | Enable, Debug level | Detailed logs for issue diagnosis           |
| **Compliance/audit**      | Enable, Info level  | Centralized audit trail                     |
| **Performance analysis**  | Enable, Info level  | Track timing, throughput, bottlenecks       |

**External logging endpoint requirements:**

- Accepts HTTP POST with JSON body
- Handles log volume (can be high with Debug level)
- Secured with HTTPS and authentication (recommended)

**Log payload contract:** Each log entry is a JSON object. Implementations should accept at least these fields (and may receive additional fields in the future):

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

### Operation log line kinds (`accountList`)

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

**Log monitor migration:**

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

**Correlation activity format (`EVENT_SUMMARY`, `PHASE END`, and Output/Epilogue `STATUS`):**

- **Link** — correlation-on-aggregation PATCH during Refresh/Process: `correlations link=14/18`
- **Merge** — merge-decision-driven PATCH during Process: `merge=2/2`
- **Completed** — correlation PATCH resolved: `completed=+147/10s` (interval delta) or `completed=147` (cumulative)
- **Pending** — correlation PATCH still queued (Output/Epilogue STATUS): `pending=1853`
- **Skipped** — PATCH not attempted: `skipped=noIdentity=3,noSourceContext=2,noIscAccountId=1`

`correlated-action=` is reserved for non-aggregation operations (for example `accountUpdate` entitlement grants) and does **not** appear during `accountList`.

**Match outcome segment (`STATUS`, `DETAIL`, `PHASE END`):**

Compact counters mirror match discovery during Process phase:

`matches(5n/2m/4a/1d)`

| Token | Meaning |
| ----- | ------- |
| `n` | Non-match outcomes |
| `m` | Manual review forms queued |
| `a` | Automatic merges applied |
| `d` | Deferred matches discovered |

When `total=` is present (for example on phase-complete `DETAIL` lines), it is the sum of all four counts.

**Decision outcome segment (`STATUS`, `DETAIL`, `PHASE END`, `EVENT_SUMMARY`):**

Reviewer and automatic merge decisions use the same compact style:

`decisions(1n/1m/0nm/0a)`

| Token | Meaning |
| ----- | ------- |
| `n` | **New identity** — reviewer chose to create a new identity (authoritative source) |
| `m` | **Merge** — reviewer chose to merge into an existing identity |
| `nm` | **No-match** — reviewer confirmed no match (record/orphan sources) |
| `a` | **Auto-merge** — system merged without review (exact-match threshold) |

**Decision headline lines (Info):**

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

Example grep targets:

```bash
grep 'DECISION DISCOVERED' connector.log
grep 'DECISION APPLIED' connector.log
grep 'EVENT_SUMMARY decisions' connector.log
grep 'DETAIL.*decisions=' connector.log
grep 'decisions(' connector.log
```

**Correlation activity format (`EVENT_SUMMARY`, `PHASE END`, and Output/Epilogue `STATUS`):**

- **Link** — correlation-on-aggregation PATCH during Refresh/Process: `correlations link=14/18`
- **Merge** — merge-decision-driven PATCH during Process: `merge=2/2`
- **Completed** — correlation PATCH resolved: `completed=+147/10s` (interval delta) or `completed=147` (cumulative)
- **Pending** — correlation PATCH still queued (Output/Epilogue STATUS): `pending=1853`
- **Skipped** — PATCH not attempted: `skipped=noIdentity=3,noSourceContext=2,noIscAccountId=1`

Example grep targets:

```bash
grep 'EVENT_SUMMARY correlations' connector.log
grep 'PHASE 4 Process END correlations link=' connector.log
grep 'correlations merge=' connector.log
grep 'correlations.*completed=' connector.log
grep 'pending=' connector.log
```

**General grep targets:** `STATUS`, `WARN STALL`, `EVENT_SUMMARY`, `PHASE 4 Process START`, `DETAIL`

---

## Part 2: Advanced Connection Settings

Advanced Connection Settings control API behavior, resilience, and performance.

### Configuration overview

| Category                  | Fields                                         | Purpose                               |
| ------------------------- | ---------------------------------------------- | ------------------------------------- |
| **Provisioning & timing** | Provisioning timeout, Processing wait time, Heartbeat interval | Max wait times and operation log cadence |
| **Queue**                 | Max concurrent requests, Parallel batch size, Requests per second | Rate limiting and concurrency control |
| **Retry**                 | API request retries                            | Automatic retry for failed requests   |

**Screenshot placeholder:** Advanced Connection Settings interface.

![Advanced Connection Settings - Configuration](../../assets/images/advanced-settings-connection.png)

<!-- PLACEHOLDER: Screenshot of Advanced Connection Settings. Save as docs/assets/images/advanced-settings-connection.png -->

### Provisioning and timing

| Field                              | Default | Range   | Purpose                                                                                                                  |
| ---------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Provisioning timeout (seconds)** | 300     | 60–3600 | Max in-flight HTTP time per queue execution attempt (enable/disable, create/update). Does **not** include time spent waiting in the API queue or for a rate-limit slot. |
| **Processing wait time (seconds)** | 60      | 0–600   | Interval between keep-alive signals during account list and account update; prevents timeouts on long-running operations |
| **Heartbeat interval (seconds)**   | 10      | 5+      | How often STATUS and EVENT_SUMMARY lines are emitted during long operations; lower = faster visibility, higher = less log volume |

**Provisioning timeout tuning:**

| Account volume  | Recommended timeout   | Rationale                                |
| --------------- | --------------------- | ---------------------------------------- |
| <1,000 accounts | 300 (default)         | Standard operations complete quickly     |
| 1,000–10,000    | 600 (10 min)          | Bulk operations take longer              |
| 10,000+         | 1200–3600 (20–60 min) | Very large batches need extended timeout |
| Slow ISC API    | +50% increase         | Adjust for tenant-specific performance   |

**Symptoms of timeout too low:**

- Provisioning operations fail with timeout errors
- Accounts stuck in processing state
- Intermittent aggregation failures

### Queue (rate limiting and concurrency)

The connector uses a **sliding-window rate limiter** aligned with ISC tenant API limits (~**100 requests per 10 seconds**). Default cap is **80 starts per 10 seconds** (conservative headroom). Burst starts within the window are allowed; the legacy **Requests per second** field derives the window cap when customized (`RPS × 10`, max 100).

| Field                           | Default | Range   | Purpose                                      |
| ------------------------------- | ------- | ------- | -------------------------------------------- |
| **Maximum concurrent requests** | 20      | 1–30    | Max simultaneous in-flight HTTP calls        |
| **Parallel pagination batch size** | 12   | 1–16    | Max in-flight pages per parallel pagination stream (sliding window); global concurrency still capped by max concurrent requests |
| **Requests per second**         | 10      | 1–12    | Legacy hint; derives sliding-window cap when changed |

**When to adjust queue settings:**

| Scenario                        | Configuration                                      |
| ------------------------------- | -------------------------------------------------- |
| Production (>500 accounts)      | Max concurrent: 20; parallel batch: 12             |
| Large dataset (>5,000 accounts) | Start at defaults; raise concurrent cautiously     |
| ISC API rate limits             | Lower requests per second (lowers window cap)      |
| HTTP 429 errors                 | Lower RPS and/or max concurrent requests           |
| Testing/development             | Default settings usually fine                      |

**Tuning guidelines:**

| Metric                      | Initial value | Adjust if...                                                                                  |
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| **Max concurrent requests** | 20            | HTTP 429 errors → decrease to 10–15; slow aggregation and no errors → increase toward 25–30 |
| **Parallel batch size**     | 12            | May exceed max concurrent for pipelining; lower if 429s appear on large fetches                |
| **Requests per second**     | 10            | HTTP 429 errors → decrease to 4–6; lowers derived window cap                                  |

**Interaction with Connection Settings:**

The **Requests per second** field also appears in **Connection Settings**. They control the same setting:

- Set in either location (Connection Settings or Advanced Settings)
- Advanced Settings is the "main" location for queue configuration
- Connection Settings provides quick access for common tuning

**Queue behavior:**

```
Parallel pagination (Fetch):
1. Initial page fetched with X-Total-Count
2. Sliding window keeps up to parallelBatchSize page requests in flight
3. When any page completes → next offset enqueued (no batch barrier)
4. Pages yielded to callers in ascending offset order

Shared API queue:
1. API request added to queue
2. Queue checks sliding window (starts in last 10s < cap)
3. When a rate slot is available AND activeRequests < max concurrent:
   → HTTP execution begins (activeRequests++)
4. If rate-limited but concurrency available → wait for window slot (does not hold concurrency)
5. Retries reuse existing retry policy
```

### Retry

Automatic retry is always enabled for failed API requests.

| Field                   | Default | Range | Purpose                        |
| ----------------------- | ------- | ----- | ------------------------------ |
| **API request retries** | 20      | 0–20  | Max retry attempts per request |

**When retry helps:**

| Scenario                  | Configuration                              |
| ------------------------- | ------------------------------------------ |
| Production                | Retries: 20                                |
| Transient network issues  | Handles temporary failures                 |
| ISC API rate limits (429) | Automatic backoff; uses Retry-After header |
| Testing/development       | Default settings usually fine              |

**Retry behavior:**

```
Standard retry:
1. Request fails (network error, 5xx, etc.)
2. Wait: base delay with exponential backoff
3. Retry #1
4. If fails: wait (longer backoff)
5. Retry #2
6. ...continue up to max retries

HTTP 429 retry (rate limit):
1. Request fails with HTTP 429
2. Check Retry-After header
3. Wait: Retry-After (with jitter)
4. Retry
5. Continue up to max retries
```

**Tuning guidelines:**

| Symptom                     | Adjustment                  |
| --------------------------- | --------------------------- |
| Transient failures          | 10–20 retries               |
| Frequent HTTP 429           | 20+ retries; lower RPS      |
| Long-duration failures      | Increase retry count        |
| Quick failures (auth, etc.) | Lower retry count (5–10)    |

!!! note

    The retry delay uses exponential backoff with a 1000 ms base. For HTTP 429, the connector uses the `Retry-After` header from the API response, which may be longer.

## Part 3: Configuration patterns

### Pattern 1: Production with many accounts (recommended)

**Scenario:** 5,000–50,000 accounts; normal ISC API performance.

```
Developer Settings:
- Reset accounts: No
- External logging: Yes
- External logging URL: [your log aggregator]
- External logging level: Info

Advanced Connection Settings:
- Provisioning timeout: 600 seconds
- Max concurrent requests: 20
- Parallel pagination batch size: 12
- API request retries: 20
- Requests per second: 10
```

**Rationale:**

- Queue + retry handle rate limits and transient failures
- External logging provides visibility
- Moderate concurrency balances speed and API load

### Pattern 2: Large scale (50,000+ accounts)

**Scenario:** Very large dataset; need maximum throughput.

```
Advanced Connection Settings:
- Provisioning timeout: 1800 seconds (30 min)
- Max concurrent requests: 20
- Parallel pagination batch size: 12
- API request retries: 20
- Requests per second: 10
```

**Rationale:**

- Extended timeout for bulk operations
- Concurrency and RPS tuned to connector-spec ranges
- More retries for resilience

### Pattern 3: Rate limit sensitive

**Scenario:** ISC tenant has strict rate limits; frequent HTTP 429 errors.

```
Advanced Connection Settings:
- Max concurrent requests: 5
- API request retries: 20
- Requests per second: 5
```

**Rationale:**

- Low concurrency and RPS respect rate limits
- Many retries with longer delay

### Pattern 4: Development/testing

**Scenario:** Small dataset; testing configuration changes.

```
Developer Settings:
- Reset accounts: Yes (once, then disable)
- External logging: Yes (Debug level)
- External logging URL: [dev log endpoint]

Advanced Connection Settings:
- Provisioning timeout: 300
- API request retries: 10
```

**Rationale:**

- Reset accounts for clean slate
- Debug logging for troubleshooting
- Simpler settings for easier debugging

### Pattern 5: Troubleshooting performance

**Scenario:** Aggregation is slow; need to diagnose bottleneck.

```
Developer Settings:
- External logging: Yes
- External logging level: Debug

Advanced Connection Settings:
- (Start with defaults)
- Monitor logs for:
  - API call timings
  - Queue wait times
  - Retry attempts
- Adjust based on findings
```

---

## Monitoring and optimization

### Key metrics

| Metric                      | How to track                | Target                                         |
| --------------------------- | --------------------------- | ---------------------------------------------- |
| **Aggregation duration**    | ISC aggregation history     | <1 hour for <5k accounts; scale proportionally |
| **API errors (rate limit)** | External logs; ISC logs     | 0 HTTP 429 errors                              |
| **API errors (other)**      | External logs; ISC logs     | <1% error rate                                 |
| **Retry rate**              | External logs (Debug level) | <5% of requests retried                        |
| **Queue wait time**         | External logs (Debug level) | <10% of total request time                     |

### Optimization workflow

| Step                   | Action                                                                              | Goal                |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| 1. Baseline            | Run aggregation with default settings; record metrics                               | Establish baseline  |
| 2. Identify bottleneck | Check: HTTP 429? Slow API? High queue wait?                                         | Find constraint     |
| 3. Adjust              | Lower RPS if 429; increase concurrency if slow                                          | Relieve bottleneck  |
| 4. Test                | Run aggregation with new settings; compare metrics                                  | Measure improvement |
| 5. Iterate             | Repeat steps 2–4 until satisfactory                                                 | Optimize            |

---

## Troubleshooting

| Issue                           | Possible cause                         | Solution                                                     |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| **HTTP 429 (rate limit)**       | RPS too high                           | Lower RPS; retry is automatic                                |
| **Aggregation timeout**         | Provisioning timeout too low; slow API | Increase timeout; check ISC performance                      |
| **Slow aggregation**            | Low concurrency                        | Increase max concurrent requests; tune RPS                   |
| **Accounts stuck processing**   | Timeout; unfinished run                | Increase timeout; retry aggregation (auto-resets stuck flag) |
| **External logs not appearing** | Wrong URL; endpoint down               | Verify URL; check endpoint availability                      |
| **Reset not working**           | Flag still enabled after run           | Reset flags auto-disable after one run; verify connector version supports `resetAccounts` / `resetForms` |

---

## Integration with Connection Settings

Some settings appear in both **Connection Settings** and **Advanced Settings**:

| Setting                 | Connection Settings | Advanced Settings              | Recommendation                         |
| ----------------------- | ------------------- | ------------------------------ | -------------------------------------- |
| **API request retries** | ✓                   | ✓ (field: API request retries) | Use Advanced Settings for full control |
| **Requests per second** | ✓                   | ✓ (field: Requests per second) | Either; they control same setting      |

**Why duplicated?**

- **Connection Settings:** Quick access for common tuning
- **Advanced Settings:** Comprehensive configuration with all related fields

---

## Summary

| Setting category          | Key fields                            | Use for                                 |
| ------------------------- | ------------------------------------- | --------------------------------------- |
| **Developer Settings**    | Reset accounts, External logging      | Testing, troubleshooting, monitoring    |
| **Provisioning & timing** | Provisioning timeout, Processing wait, Heartbeat interval | Operation timeouts and log cadence      |
| **Queue**                 | Max concurrent, RPS                   | Rate limiting, concurrency control      |
| **Retry**                 | API request retries                   | Resilience, handling transient failures |

**Best practices:**

1. **Production:** Tune retries, concurrency, and RPS; configure external logging
2. **Rate limits:** Lower RPS and concurrency; retries are automatic
3. **Performance:** Increase concurrency and RPS only within tenant rate limits
4. **Testing:** Use Debug logging; enable reset once then disable
5. **Monitoring:** Track metrics; adjust based on observed behavior

**Next steps:**

- For proxy mode (delegating to external server), see [Configuring proxy mode](../../reference/proxy-mode.md).
- For connection and configuration issues, see [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md).











