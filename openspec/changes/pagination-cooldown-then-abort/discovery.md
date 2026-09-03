## Scope

In: when a paginated `client.call` (sequential, parallel, or searchAfter) hits a streak of **gateway failures** (HTTP 504 or HTTP timeouts), **shed** in-flight pages, **cooldown**, **probe** once, then **abort** the pagination call with `PaginationError` if the probe fails — at most one cooldown per stream. Out: replacing OFFSET / parallel listAccounts with keyset or id-range partition; a global `ApiQueue` kill switch for non-paginated calls; success-path adaptive window shrink; unbounded cooldown loops; silent partial pages.

## Language

**Gateway failure** (`promote`):
An HTTP 504 or a request timeout (`ECONNABORTED` / `ETIMEDOUT`) on a page fetch. Distinct from HTTP 429 (rate limit) and from other 5xx that may still be retried per the existing queue policy.
_Avoid_: treating every 5xx as this circuit; calling 429 a gateway failure

**Pagination circuit** (`promote`):
Per-pagination-stream state that sheds load after consecutive gateway failures, then either resumes after a successful probe or fails the call. Not a tenant-wide or whole-queue breaker.
_Avoid_: circuit breaker (implementation metaphor), global API kill switch

**Shed** (`draft`):
Stop scheduling further pages on that stream and abort in-flight page HTTP for that stream so timed-out skip queries are not stacked.
_Avoid_: drain (ambiguous with queue drain), pause (sounds like in-flight continues)

**Cooldown** (`promote`):
A bounded wait after shed with no new page starts on that stream, long enough for gateway-abandoned DB work to finish. One cooldown per pagination stream; not per-request retry delay.
_Avoid_: retry backoff (already exists per queued item, up to 20 × 60s)

**Probe** (`promote`):
A single page request after cooldown (window = 1, no stacked pagination retries beyond a tight 504 retry cap) to decide resume vs abort.
_Avoid_: health check, canary (not a separate endpoint)

**PaginationError** (canonical — reuse):
Failure of a paginated `client.call` after some items may have been collected. Silent partial-data return remains forbidden.
_Avoid_: returning the pages collected so far as success

## Decisions

Context: A P1 occurred when Identity Fusion paged `listAccounts` with rising `offset` (parallel sliding window). High offsets caused ISC DB latency, SLO breach, and HTTP 504 per connector request. Per-page queue retry already waits (exponential backoff, cap 60s, default 20 attempts) and then the window schedules the next offset — amplifying load. Stakeholders asked for a consecutive-failure circuit. Exploration settled on **cooldown then abort**, not abort-first and not cooldown-forever. OFFSET replacement is a separate change.

Q1: Abort immediately vs cooldown then abort vs cooldown forever?
Chosen: **Cooldown then abort.** Shed the stream, wait once, probe once; probe 504/timeout → `PaginationError`. Gives congestion a chance without hanging Fetch until ISC command expiry.

Q2: Whole `ApiQueue` vs pagination stream only?
Chosen: **Pagination stream only.** The P1 is bulk account (and other list) paging. A 504 on one `listAccounts` page MUST NOT open a breaker that blocks unrelated HIGH-priority writes (forms, patches).

Q3: Which HTTP outcomes trip the circuit?
Chosen: **Gateway failure = 504 or request timeout.** 429 stays on Retry-After. Other 5xx keep existing per-item retry unless they exhaust into a page failure that is not a gateway failure — those still throw `PaginationError` immediately (today’s semantics), without cooldown.

Q4: How many cooldowns?
Chosen: **At most one cooldown per pagination stream.** A second consecutive gateway-failure streak after a successful probe (or a failed probe) aborts. Prevents slow-motion P1.

Q5: Interaction with `maxRetries` (default 20)?
Chosen: **Do not stack a full 20-retry budget on gateway failures during pagination.** Page fetches that see a gateway failure use a tight retry cap (design constant, expected 0–1 extra attempt) so consecutive failures surface to the pagination circuit instead of hammering the same OFFSET. Non-paginated `call()` retry policy unchanged.

Q6: Resume after a successful probe?
Chosen: **Yes, closed circuit, restore the configured parallel window** (or sequential/searchAfter cadence). OFFSET pagination itself is unchanged. Probe success means congestion, not “this skip is cheap forever.”

Q7: Partial data on abort?
Chosen: **No.** Existing rule: throw `PaginationError` with items collected before failure; do not yield remaining pages or return a successful partial list.

## Open questions

None blocking. Consecutive-failure threshold, cooldown duration, and 504 pagination retry cap are design constants (not new connector-spec fields) unless apply-time testing shows operators need knobs.

Deferred (explicit): replacing OFFSET with keyset or parallel id-range workers; shrinking `parallelBatchSize` as offset/latency grows on the success path.

## Scenarios discussed

- Parallel `listAccounts` window of ~12–16 pages at high offset all 504 — shed MUST abort in-flight siblings, not retry each 20 times then schedule higher offsets.
- Sequential pagination 504 on page N — no parallel siblings; still cooldown, probe the same offset, abort if probe fails.
- searchAfter page 504 — same circuit; probe retries the same cursor, not the next `searchAfter`.
- Probe 200 after cooldown — resume paging; later a new 504 streak aborts without a second cooldown.
- Probe 504 after cooldown — `PaginationError`; Fetch/account-list fails visibly.
- HTTP 429 during paging — not a gateway failure; existing Retry-After path.
- HTTP 500 that exhausts retries — immediate `PaginationError` (no cooldown) unless classified as gateway failure.
- Caller `abortSignal` or provisioning timeout during cooldown — abort wait, fail the call, do not start a probe.
- Empty first page vs later page 504 — circuit applies after any consecutive gateway failures on that stream, including init/`count: true` page.
- Dry-run / replay adapters — no live 504; circuit must not break replay tests that never fail.
