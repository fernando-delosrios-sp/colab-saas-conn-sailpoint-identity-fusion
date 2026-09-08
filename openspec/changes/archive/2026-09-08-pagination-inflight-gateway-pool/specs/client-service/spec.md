## MODIFIED Requirements

### Requirement: Pagination failure semantics MUST be consistent across all modes

All pagination modes (sequential, parallel, searchAfter) MUST throw a `PaginationError` when a page request fails in a way that ends the call, including the number of items successfully collected before the failure. Silent partial-data returns are not permitted. Non-gateway page failures (including exhausted non-504 5xx) MUST throw without a pagination cooldown. Gateway failures MUST follow the pagination circuit (gateway-failure pool, then shed at threshold) before throwing when the pool reaches threshold.

#### Scenario: A page failure in any pagination mode throws with context

- **GIVEN** a paginated call is in progress with any mode
- **WHEN** the call ends because of a page failure (immediate non-gateway failure or gateway-failure pool at threshold)
- **THEN** the call throws a `PaginationError` with the error message, the offset/searchAfter position, and the count of items collected before failure
- **AND** the error is not silently swallowed

#### Scenario: Gateway-failure pool below threshold does not throw

- **GIVEN** a parallel paginated call whose window is greater than 1
- **AND** the gateway-failure pool size is below `min(10, window)`
- **WHEN** a pool member page later returns success
- **THEN** that page SHALL leave the pool
- **AND** the call SHALL NOT throw a `PaginationError` solely because that page had earlier gateway failures
- **AND** the client MUST NOT wait a pagination cooldown
- **AND** the client MUST NOT send a probe page

---

### Requirement: Paginated calls MUST apply a pagination circuit using a gateway-failure pool

When `client.call()` uses any pagination mode (`sequential`, `parallel`, or `searchAfter`), the client service SHALL track a **gateway-failure pool** on that pagination stream only. A gateway failure is an HTTP 504 or a request timeout (`ECONNABORTED` or `ETIMEDOUT`). HTTP 429 is not a gateway failure. A page (offset or searchAfter cursor) SHALL enter the pool when it observes a gateway failure and SHALL leave the pool only when that same page returns success. The stream’s **window** is `paginate.batchSize` when set, otherwise configured `parallelBatchSize` for parallel mode, and **1** for sequential and searchAfter modes. When the pool size reaches `min(10, window)`, the client service SHALL **shed** the stream: it MUST NOT schedule further pages on that stream and MUST abort in-flight page HTTP for that stream without aborting unrelated queued calls. It MUST then throw a `PaginationError`. It MUST NOT wait a pagination cooldown and MUST NOT send a probe page. Below threshold, a pool member SHALL keep occupying a window slot and MAY be re-attempted; the client MUST NOT enqueue a new page into that slot until the member succeeds or the call aborts. Silent partial-data success is not permitted.

#### Scenario: Parallel window trips the pool and aborts without cooldown

- **GIVEN** a parallel paginated `client.call` with window 12
- **AND** 10 in-flight pages are in the gateway-failure pool
- **WHEN** the pagination circuit sheds the stream
- **THEN** in-flight page HTTP for that stream SHALL have been aborted
- **AND** unrelated queued calls SHALL continue
- **AND** the call MUST throw a `PaginationError` including items collected before the failure
- **AND** the client MUST NOT wait a pagination cooldown
- **AND** the client MUST NOT send a probe page
- **AND** the client MUST NOT resume that stream after a probe
- **AND** the client MUST NOT return those items as a successful partial list

#### Scenario: Successful page leaves the gateway-failure pool

- **GIVEN** a parallel paginated `client.call` with window 12
- **AND** 9 in-flight pages are in the gateway-failure pool
- **WHEN** one of those pages returns success
- **THEN** that page SHALL leave the pool
- **AND** the call SHALL NOT throw solely because the remaining pool size is below threshold

#### Scenario: Threshold scales down to a smaller parallel window

- **GIVEN** a parallel paginated `client.call` with window 8
- **AND** 8 in-flight pages are in the gateway-failure pool
- **WHEN** the pool size reaches `min(10, 8)`
- **THEN** the call MUST throw a `PaginationError`
- **AND** the client MUST NOT wait a pagination cooldown

#### Scenario: Sequential paging fails on the first gateway failure

- **GIVEN** a sequential paginated `client.call`
- **WHEN** a page request is a gateway failure
- **THEN** the call MUST throw a `PaginationError`
- **AND** the client MUST NOT wait a pagination cooldown

#### Scenario: SearchAfter paging fails on the first gateway failure

- **GIVEN** a searchAfter paginated `client.call`
- **WHEN** a page request is a gateway failure
- **THEN** the call MUST throw a `PaginationError`
- **AND** the client MUST NOT wait a pagination cooldown

#### Scenario: HTTP 429 does not trip the pagination circuit

- **GIVEN** a paginated `client.call` in progress
- **WHEN** a page request receives HTTP 429
- **THEN** the client SHALL follow the existing Retry-After retry path
- **AND** the pagination circuit SHALL NOT add that page to the gateway-failure pool solely because of the 429
- **AND** the pagination circuit SHALL NOT shed solely because of the 429

#### Scenario: Exhausted non-gateway 5xx still fails immediately

- **GIVEN** a paginated `client.call` in progress
- **WHEN** a page request fails with HTTP 500 after retries are exhausted
- **THEN** the call MUST throw a `PaginationError` without a pagination cooldown

#### Scenario: Caller abort during paging fails without a cooldown wait

- **GIVEN** a paginated `client.call` in progress
- **WHEN** the caller `abortSignal` aborts
- **THEN** the call MUST fail
- **AND** the client MUST NOT wait a pagination cooldown before failing
- **AND** the client MUST NOT send a probe page

---

### Requirement: Paginated page fetches MUST cap retries on gateway failures

Page fetches issued by a paginated `client.call` SHALL use at most **1** retry (`maxRetries` 1) when the error is a gateway failure. Other retryable errors on those page fetches SHALL keep the configured `maxRetries`. Non-paginated `client.call` invocations SHALL keep the configured `maxRetries` for gateway failures.

#### Scenario: Paginated 504 does not consume the full configured retry budget

- **GIVEN** configured `maxRetries` is 20
- **AND** a paginated page request receives HTTP 504
- **WHEN** the page fetch retries according to pagination gateway-failure policy
- **THEN** the client SHALL attempt at most one retry of that page for the gateway failure
- **AND** a gateway failure on that page SHALL place it in the gateway-failure pool until that page succeeds or the call ends

#### Scenario: Non-paginated 504 keeps configured retries

- **GIVEN** configured `maxRetries` is 20
- **AND** a non-paginated `client.call` receives HTTP 504
- **WHEN** the queue retries the item
- **THEN** the item SHALL be eligible to retry up to the configured `maxRetries`
- **AND** the pagination circuit SHALL NOT shed other calls

---

## RENAMED Requirements

- FROM: `### Requirement: Paginated calls MUST apply a pagination circuit on consecutive gateway failures`
- TO: `### Requirement: Paginated calls MUST apply a pagination circuit using a gateway-failure pool`
