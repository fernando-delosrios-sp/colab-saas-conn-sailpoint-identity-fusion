# Effective Use of Advanced Connection Settings

Advanced Settings provide fine-grained control over API behavior, resilience, performance, and observability for the Identity Fusion NG connector. This comprehensive guide covers **Developer Settings**, **Advanced Connection Settings**, and how they integrate with base **Connection Settings** for optimal connector operation.

---

## Overview and structure

Advanced Settings are organized into three sections:

| Section                          | Purpose                                                         | When to configure                                                  |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Developer Settings**           | Reset accounts, external logging                                | Testing, troubleshooting, centralized monitoring                   |
| **Advanced Connection Settings** | API behavior: queue, retry, timeouts, concurrency | Production tuning, rate limit management, performance optimization |
| **Proxy Settings**               | Delegate processing to external server                          | Custom deployment requirements (see [Proxy mode](proxy-mode.md))   |

**Screenshot placeholder:** Advanced Settings menu interface.

![Advanced Settings menu - Overview](../assets/images/advanced-settings-menu.png)

<!-- PLACEHOLDER: Screenshot of Advanced Settings with Developer and Advanced Connection sections. Save as docs/assets/images/advanced-settings-menu.png -->

---

## Part 1: Developer Settings

Developer Settings provide tools for testing, troubleshooting, and monitoring.

### Configuration fields

| Field                                            | Type     | Purpose                                                                                        | Default                                                | Risk level                                    |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| **Reset accounts?**                              | Boolean  | Force rebuild of all Fusion accounts from scratch                                              | No                                                     | ⚠️ **HIGH** — Deletes all Fusion account data |
| **Managed accounts batch size**                  | Number   | Number of uncorrelated managed accounts per batch                                              | 100                                                    | Low                                           |
| **Force attribute refresh on next aggregation?** | Boolean  | Recalculate Normal-type attributes on the next aggregation only (auto-disabled after that run) | No                                                     | Medium                                        |
| **Enable concurrency check?**                    | Boolean  | Prevent concurrent aggregations                                                                | Yes                                                    | Low                                           |
| **Enable external logging?**                     | Boolean  | Send connector logs to external endpoint                                                       | No                                                     | Low                                           |
| **External logging URL**                         | URL      | Endpoint for external log aggregation                                                          | None                                                   | Low (if endpoint secured)                     |
| **External logging level**                       | Dropdown | Minimum log level to send                                                                      | None                                                   | Low                                           |

**Screenshot placeholder:** Developer Settings interface.

![Developer Settings - Configuration](../assets/images/advanced-settings-developer.png)

<!-- PLACEHOLDER: Screenshot of Developer Settings. Save as docs/assets/images/advanced-settings-developer.png -->

### Reset accounts

**Purpose:** Force complete rebuild of Fusion account data.

**What it does:**

- Deletes all existing Fusion account state (attributes, history, processing flags)
- Next aggregation rebuilds accounts from scratch using current configuration
- Does NOT delete source accounts or identities

**When to use:**

| Scenario                                      | Use Reset?    | Alternative                                    |
| --------------------------------------------- | ------------- | ---------------------------------------------- |
| Testing major config changes                  | Yes (once)    | Test with small batch first                    |
| Schema changes (attribute mapping/definition) | Maybe         | Discover Schema usually sufficient             |
| Stuck processing state                        | No            | Retry aggregation (auto-resets the stuck flag) |
| Production environment                        | ⚠️ **Rarely** | High impact; requires careful planning         |

**Workflow:**

```
1. Enable "Reset accounts?" = Yes
2. Save configuration
3. Run account aggregation (rebuilds all accounts)
4. Verify accounts rebuilt correctly
5. IMMEDIATELY disable "Reset accounts?" = No
6. Save configuration
→ Prevents accidental reset on next run
```

!!! warning

    - **Data loss:** All Fusion account history, processing state, and custom attributes are deleted
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

During long `accountList` aggregations, the connector emits standardized text prefixes in log messages (prefixed with `[accountList]`). Use these for monitoring and alerting instead of legacy patterns.

| Prefix | Level | Purpose |
| ------ | ----- | ------- |
| `STATUS` | Info | Periodic heartbeat (~30s): phase, step, progress, queue delta, memory, elapsed time |
| `EVENT_SUMMARY` | Info | Aggregated match/correlation counts since the previous heartbeat tick |
| `PHASE` / `STEP` | Info | Pipeline boundary markers (`START` / `END`) |
| `WARN STALL` | Warn | API queue stopped completing requests for ~60s; includes active request labels |
| `EPILOGUE` | Info | Report epilogue start (not a numbered phase) |
| `METRIC` | Info | Phase/step timing metrics |

**Log monitor migration:**

| Legacy pattern (removed) | Replace with |
| ------------------------ | ------------ |
| `Queue Stats:` | `STATUS` (queue stats appear inside STATUS lines) |
| `Memory usage` | `STATUS` (RSS/heap appear inside STATUS lines) |
| Per-account `MATCH FOUND:` / `Triggering correlation` at Info | `EVENT_SUMMARY` (per-account detail remains at Debug) |

**Example grep targets:** `STATUS`, `WARN STALL`, `EVENT_SUMMARY`, `PHASE 4 Process START`

---

## Part 2: Advanced Connection Settings

Advanced Connection Settings control API behavior, resilience, and performance.

### Configuration overview

| Category                  | Fields                                         | Purpose                               |
| ------------------------- | ---------------------------------------------- | ------------------------------------- |
| **Provisioning & timing** | Provisioning timeout, Processing wait time     | Max wait times for operations         |
| **Queue**                 | Max concurrent requests, Parallel batch size, Requests per second | Rate limiting and concurrency control |
| **Retry**                 | API request retries                            | Automatic retry for failed requests   |

**Screenshot placeholder:** Advanced Connection Settings interface.

![Advanced Connection Settings - Configuration](../assets/images/advanced-settings-connection.png)

<!-- PLACEHOLDER: Screenshot of Advanced Connection Settings. Save as docs/assets/images/advanced-settings-connection.png -->

### Provisioning and timing

| Field                              | Default | Range   | Purpose                                                                                                                  |
| ---------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Provisioning timeout (seconds)** | 300     | 60–3600 | Max wait for provisioning operations (enable/disable, create/update)                                                     |
| **Processing wait time (seconds)** | 60      | 0–600   | Interval between keep-alive signals during account list and account update; prevents timeouts on long-running operations |

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
| **Parallel pagination batch size** | 12   | 1–16    | Pages fetched in parallel during pagination  |
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
| **Parallel batch size**     | 12            | Keep ≤ max concurrent; lower if pagination bursts trigger 429s                                |
| **Requests per second**     | 10            | HTTP 429 errors → decrease to 4–6; lowers derived window cap                                  |

**Interaction with Connection Settings:**

The **Requests per second** field also appears in **Connection Settings**. They control the same setting:

- Set in either location (Connection Settings or Advanced Settings)
- Advanced Settings is the "main" location for queue configuration
- Connection Settings provides quick access for common tuning

**Queue behavior:**

```
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
| **Reset not working**           | Didn't disable after reset             | Reset works once; must disable to prevent repeat             |

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
| **Provisioning & timing** | Provisioning timeout, Processing wait | Operation timeouts                      |
| **Queue**                 | Max concurrent, RPS                   | Rate limiting, concurrency control      |
| **Retry**                 | API request retries                   | Resilience, handling transient failures |

**Best practices:**

1. **Production:** Tune retries, concurrency, and RPS; configure external logging
2. **Rate limits:** Lower RPS and concurrency; retries are automatic
3. **Performance:** Increase concurrency and RPS only within tenant rate limits
4. **Testing:** Use Debug logging; enable reset once then disable
5. **Monitoring:** Track metrics; adjust based on observed behavior

**Next steps:**

- For proxy mode (delegating to external server), see [Configuring proxy mode](proxy-mode.md).
- For connection and configuration issues, see [Troubleshooting](troubleshooting.md).


