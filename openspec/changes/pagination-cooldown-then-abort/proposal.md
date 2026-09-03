## Why

Identity Fusion pages ISC `listAccounts` with a sliding window of rising `offset` values. High offsets drove DB latency, SLO breach, and HTTP 504s (P1). The queue already retries 5xx up to 20 times with up to 60s backoff, then the window schedules the next offset — amplifying load while Fetch still looks “healthy.” We need a per-pagination-stream cooldown-then-abort: shed in-flight pages, wait once, probe once, then fail with `PaginationError` if the gateway is still dying. Replacing OFFSET paging is a separate change.

## What Changes

**Pagination circuit (cooldown then abort)**
- From: Any page HTTP failure (after per-item retries) throws `PaginationError` immediately; 504s are retried like any 5xx (default 20) while sibling offsets stay in flight and new offsets keep enqueueing
- To: Consecutive **gateway failures** (HTTP 504 or request timeout) on one paginated `client.call` **shed** that stream (no new pages; abort in-flight page HTTP), **cooldown** once, **probe** the next needed page once; probe success resumes the configured window; probe failure or a second streak throws `PaginationError`
- Reason: Stop stacking skip-scans on an overloaded ISC while still giving transient congestion one chance
- Impact: Non-breaking public `call()` shape; Fetch/account-list can fail earlier and louder on 504 storms; other queue traffic continues

**Gateway-failure retry cap on page fetches**
- From: Paginated page requests inherit `maxRetries` (default 20) for all retryable errors including 504
- To: Page fetches in a paginated call use a tight retry cap on gateway failures so the pagination circuit sees the streak instead of 20 copies of the same OFFSET
- Reason: Per-request cooldown already exists and was the amplifier
- Impact: Non-paginated `call()` retry policy unchanged; 429 still uses Retry-After

**Vocabulary**
- From: No canonical terms for this failure path
- To: Glossary defines gateway failure, pagination circuit, cooldown, and probe
- Reason: Operators and code must not confuse this with queue retry or a global kill switch
- Impact: `openspec/specs/ubiquitous-language` + `docs/concepts/glossary.md`

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `client-service`: Pagination circuit on sequential, parallel, and searchAfter modes; gateway-failure retry cap for page fetches; shed + cooldown + probe + abort semantics; `PaginationError` still forbids silent partial success
- `ubiquitous-language`: Canonical terms for gateway failure, pagination circuit, cooldown, and probe

## Impact

- **Code:** `src/services/clientService/` (pagination helpers, `OffsetPageScheduler` / parallel window abort, `ApiQueue` retry cap for page policy, tests in `clientService.test.ts` and `apiQueue.test.ts` as needed)
- **Specs:** deltas for `client-service` and `ubiquitous-language`
- **Docs:** `docs/use-guides/operation/tune-api-performance.md` (504 path vs retries); `CHANGELOG.md`; glossary mirror
- **Operations:** Large-source Fetch may fail after one cooldown instead of grinding 504s; OFFSET cost on successful pages is unchanged
- **Out of scope:** Keyset / id-range parallel fetch; global queue breaker; new connector-spec knobs (constants unless apply proves otherwise)
