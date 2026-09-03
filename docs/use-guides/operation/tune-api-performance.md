# Tune API performance

Use this guide when you need to **fix slow aggregations, HTTP 429 rate limits, or provisioning timeouts** — without changing Match or source configuration.

**Configuration reference:** [Connection Settings](../../configuration/connection.md) · [Advanced Settings — Advanced Connection Settings](../../configuration/advanced.md) · [ISC PAT scopes](../../reference/pat-scopes.md)

!!! note "Didactic guide"
    This page explains **how and when** to tune queue, retry, and timeout settings. For field keys, types, defaults, and constraints, see the linked **Configuration reference**.

---

## When you need this

| Symptom | Likely cause | Start with |
| --- | --- | --- |
| HTTP 429 errors in logs | RPS or concurrency too high | Lower **Requests per second** and **Maximum concurrent requests** |
| Provisioning timeout failures | Timeout too low for volume | Raise **Provisioning timeout** |
| Aggregation slow but no 429s | Concurrency too conservative | Raise **Maximum concurrent requests** cautiously |
| Long runs but ISC disconnects | Keep-alive interval too long | Lower **Processing wait time** if needed |
| Need faster log heartbeats | Heartbeat interval too high | Lower **Heartbeat interval** (see [Monitor aggregation progress](monitor-aggregation-progress.md)) |

---

## Overview

Advanced Connection Settings control API behavior, resilience, and performance:

| Category | Fields | Purpose |
| --- | --- | --- |
| **Provisioning & timing** | Provisioning timeout, Processing wait time, Heartbeat interval | Operation timeouts and log cadence |
| **Queue** | Max concurrent requests, Parallel batch size, Requests per second | Rate limiting and concurrency |
| **Retry** | API request retries | Automatic retry for failed requests |

![Advanced Connection Settings - Configuration](../../assets/images/advanced-settings-connection.png)

Some settings also appear in **Connection Settings** — they control the same values. Advanced Settings is the comprehensive location; Connection Settings provides quick access for common tuning.

---

## Workflow: tune provisioning and timing

| Field | Default | Range | Purpose |
| --- | --- | --- | --- |
| **Provisioning timeout (seconds)** | 300 | 60–3600 | Max in-flight HTTP time per queue execution attempt |
| **Processing wait time (seconds)** | 180 | 10–180 | Keep-alive interval during long account list/update |
| **Heartbeat interval (seconds)** | 10 | 5+ | How often `STATUS` lines emit (`EVENT_SUMMARY` uses the same interval when it has extra activity) |

**Provisioning timeout by volume:**

| Account volume | Recommended timeout |
| --- | --- |
| <1,000 | 300 (default) |
| 1,000–10,000 | 600 (10 min) |
| 10,000+ | 1200–3600 (20–60 min) |
| Slow ISC API | +50% over baseline |

**Symptoms of timeout too low:** provisioning failures, accounts stuck in processing, intermittent aggregation failures.

---

## Workflow: tune queue settings

The connector uses a **sliding-window rate limiter** aligned with ISC tenant API limits (~**100 requests per 10 seconds**). Default cap is **80 starts per 10 seconds**. The **Requests per second** field derives the window cap when customized (`RPS × 10`, max 100).

| Field | Default | Range | Purpose |
| --- | --- | --- | --- |
| **Maximum concurrent requests** | 20 | 1–30 | Max simultaneous in-flight HTTP calls |
| **Parallel pagination batch size** | 12 | 1–16 | Max in-flight pages per parallel pagination stream |
| **Requests per second** | 10 | 1–12 | Legacy hint; derives sliding-window cap |

**When to adjust:**

| Scenario | Configuration |
| --- | --- |
| Production (>500 accounts) | Max concurrent: 20; parallel batch: 12 |
| HTTP 429 errors | Lower RPS to 4–6; decrease max concurrent to 10–15 |
| Slow aggregation, no 429s | Increase max concurrent toward 25–30 cautiously |
| Large fetches with 429s | Lower parallel batch size |

**Queue behavior (summary):**

```
Parallel pagination (Fetch):
1. Initial page fetched with X-Total-Count
2. Sliding window keeps up to parallelBatchSize page requests in flight
3. When any page completes → next offset enqueued
4. Pages yielded in ascending offset order

Shared API queue:
1. Request enqueued
2. Sliding window check (starts in last 10s < cap)
3. When rate slot AND activeRequests < max concurrent → HTTP begins
4. Retries reuse existing retry policy
```

Monitor queue health via `STATUS` `api=` segment and `WARN STALL` — see [Monitor aggregation progress](monitor-aggregation-progress.md).

---

## Workflow: tune retry

Automatic retry is always enabled for failed API requests.

| Field | Default | Range | Purpose |
| --- | --- | --- | --- |
| **API request retries** | 20 | 0–20 | Max retry attempts per request |

| Symptom | Adjustment |
| --- | --- |
| Transient failures | 10–20 retries |
| Frequent HTTP 429 | 20+ retries; also lower RPS |
| Quick failures (auth) | Lower retry count (5–10) |

Retry uses exponential backoff (1000 ms base). For HTTP 429, the connector uses the `Retry-After` header from the API response.

---

## Pagination circuit vs API request retries

**API request retries** apply to each queued HTTP call (including non-paginated writes). Default is 20 attempts with exponential backoff.

A **pagination circuit** applies only to one paginated `client.call` stream (sequential, parallel, or searchAfter). It does **not** replace OFFSET paging, shrink the parallel window on success, or pause the whole API queue.

When **3** completed page outcomes on that stream are **gateway failures** (HTTP **504** or request timeout) with no successful page in between:

1. **Shed** — stop scheduling further pages on that stream and abort in-flight page HTTP for that stream. Other queued calls keep running.
2. **Cooldown** — wait once (30 seconds). Caller abort during cooldown fails the call and does **not** send a probe.
3. **Probe** — fetch the lowest not-yet-successful page once (same offset or same searchAfter cursor). Success resumes the configured parallel window. Another gateway failure, or a second 504/timeout streak after resume, fails Fetch/account-list with `PaginationError` (no silent partial list, no second cooldown).

Paginated pages use **at most one extra attempt** on gateway failure so the circuit can see the streak. Non-paginated calls still use **API request retries**. HTTP 429 still uses Retry-After and does not trip the circuit. Other exhausted 5xx (for example HTTP 500) still fail the page immediately without cooldown.

---

## Configuration patterns

### Production with many accounts (5,000–50,000)

```
Advanced Connection Settings:
- Provisioning timeout: 600 seconds
- Max concurrent requests: 20
- Parallel pagination batch size: 12
- API request retries: 20
- Requests per second: 10
```

Enable external logging at Info level — see [Monitor aggregation progress](monitor-aggregation-progress.md).

### Large scale (50,000+ accounts)

```
Advanced Connection Settings:
- Provisioning timeout: 1800 seconds (30 min)
- Max concurrent requests: 20
- Parallel pagination batch size: 12
- API request retries: 20
- Requests per second: 10
```

### Rate limit sensitive (frequent HTTP 429)

```
Advanced Connection Settings:
- Max concurrent requests: 5
- API request retries: 20
- Requests per second: 5
```

---

## Optimization workflow

| Step | Action | Goal |
| --- | --- | --- |
| 1. Baseline | Run aggregation with defaults; record duration and log metrics | Establish baseline |
| 2. Identify bottleneck | Check logs: HTTP 429? `WARN STALL`? slow phases? | Find constraint |
| 3. Adjust | Lower RPS if 429; increase concurrency if slow and no errors | Relieve bottleneck |
| 4. Test | Run again; compare ISC aggregation history and logs | Measure improvement |
| 5. Iterate | Repeat until satisfactory | Optimize |

**Key metrics:**

| Metric | How to track | Target |
| --- | --- | --- |
| Aggregation duration | ISC aggregation history | Scale with account count |
| HTTP 429 errors | External logs | 0 |
| Retry rate | External logs (Debug) | <5% of requests |
| Queue stalls | `WARN STALL` in logs | None sustained |

---

## Troubleshooting

| Issue | Possible cause | Solution |
| --- | --- | --- |
| **HTTP 429** | RPS too high | Lower RPS and max concurrent; retry is automatic |
| **Aggregation timeout** | Provisioning timeout too low | Increase timeout; check ISC performance |
| **Slow aggregation** | Low concurrency | Increase max concurrent cautiously |
| **Accounts stuck processing** | Unfinished run | Retry aggregation (auto-resets stuck flag); increase timeout |

---

## Related guides

| Topic | Guide |
| --- | --- |
| External logging and log interpretation | [Monitor aggregation progress](monitor-aggregation-progress.md) |
| Reset stuck or inconsistent state | [Reset Fusion state](reset-fusion-state.md) |
| Common issues | [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md) |
