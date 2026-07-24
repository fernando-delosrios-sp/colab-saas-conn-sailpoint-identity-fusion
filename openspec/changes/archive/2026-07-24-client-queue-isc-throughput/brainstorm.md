# Brainstorm: Client queue ISC throughput

## Background

Account-list Fetch phase is dominated by `ClientService` / `ApiQueue` throughput. ISC enforces approximately **100 API requests per 10 seconds** (sliding window), not a hard 10 req/s steady pace.

Current queue behavior:

- `requestsPerSecond: 10` → fixed 100ms spacing between scheduled starts
- `maxConcurrentRequests: 10` → caps in-flight work
- Throttle `sleep` runs **after** `activeRequests++` → concurrency slots wasted while waiting to start HTTP
- `parallelBatchSize: 8` (code-only default) for parallel pagination
- Client timeout rejects the promise but **does not abort** the underlying axios request

Defaults and UI caps (`maxConcurrentRequests` max 10, `requestsPerSecond` max 12) under-utilize ISC's burst-friendly window and block operator tuning.

## Decision chain

**Q1: What is the primary performance problem?**

- Fetch-phase API pagination is slower than necessary because the queue self-limits below ISC's 100/10s window and holds concurrency slots during throttle waits.

**Q2: How should rate limiting align with ISC?**

- **Chosen:** Sliding-window limiter (default **80 requests / 10s**, configurable up to **100 / 10s**) replacing uniform inter-request spacing.
- **Rejected:** Keep steady 10 RPS only — same average but no burst; mismatches ISC window semantics.
- **Rejected:** Remove rate limiting — risks 429 storms; existing retry path is slower.

**Q3: How should concurrency interact with rate limiting?**

- **Chosen (A):** Decouple — rate limiter gates *start times*; `activeRequests` counts only in-flight HTTP (not throttle sleep).
- **Rejected:** Status quo — slots occupied during sleep reduce effective parallelism on slow responses.

**Q4: Should timed-out requests keep running?**

- **Chosen (B):** Wire `AbortSignal` through `execute()` → queue item → axios cancel token so timeout frees sockets and slots.
- **Rejected:** Timer-only reject — zombie requests under load.

**Q5: Should we realign `maxSockets` with concurrency (D)?**

- **Deferred:** Hardcoded `maxSockets: 50` is sufficient while defaults stay ≤25; revisit only if concurrency max rises past 50.

**Q6: What default tuning values?**

- **Chosen:**
  - `maxConcurrentRequests`: **20** (UI max **30**)
  - `parallelBatchSize`: **12** (expose in connector-spec Advanced Connection Settings)
  - Rate window: **80 / 10s** default, **100 / 10s** max
- **Backward compat:** When only legacy `requestsPerSecond` is set, derive window cap as `requestsPerSecond × (windowMs / 1000)`.

## Agreed approach

Implement **A + B** in one change:

1. `SlidingWindowRateLimiter` in `ApiQueue` (or helper module)
2. Decouple throttle wait from `activeRequests`
3. Abort-on-timeout in `ClientService.execute()`
4. Update defaults, connector-spec ranges, and `advancedConnectionSettings` docs
5. Tests: window burst, concurrency under slow HTTP, abort cancels in-flight work

## Out of scope

- maxSockets dynamic alignment (D)
- Matching/Process CPU optimizations
- Operation heartbeat / logging changes
