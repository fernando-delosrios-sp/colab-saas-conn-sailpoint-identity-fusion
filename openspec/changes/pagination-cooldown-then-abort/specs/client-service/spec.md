## ADDED Requirements

### Requirement: Paginated calls MUST apply a pagination circuit on consecutive gateway failures

When `client.call()` uses any pagination mode (`sequential`, `parallel`, or `searchAfter`), the client service SHALL track **gateway failures** on that pagination stream only. A gateway failure is an HTTP 504 or a request timeout (`ECONNABORTED` or `ETIMEDOUT`). HTTP 429 is not a gateway failure. After **3** completed page outcomes that are gateway failures with no intervening successful page on that stream, the client service SHALL **shed** the stream: it MUST NOT schedule further pages on that stream and MUST abort in-flight page HTTP for that stream without aborting unrelated queued calls. It SHALL then **cooldown** once (default 30 seconds, abortable via the caller `abortSignal`). After cooldown it SHALL **probe** once: a single fetch of the lowest not-yet-successfully-yielded page (same offset or same searchAfter cursor). If the probe succeeds, the stream SHALL resume with the configured window or cadence. If the probe is a gateway failure, the call MUST throw a `PaginationError`. If a second gateway-failure streak occurs after a successful probe, the call MUST throw a `PaginationError` without a second cooldown. If the caller `abortSignal` aborts during cooldown, the call MUST fail without probing. Silent partial-data success is not permitted.

#### Scenario: Parallel window sheds, cools down, and resumes after a successful probe

- **GIVEN** a parallel paginated `client.call` with at least three in-flight page offsets
- **AND** three page completions are gateway failures with no successful page in between
- **WHEN** the pagination circuit sheds the stream, waits the cooldown, and the probe page returns success
- **THEN** in-flight page HTTP for that stream SHALL have been aborted
- **AND** unrelated queued calls SHALL continue
- **AND** pagination SHALL resume with the configured parallel window
- **AND** the call SHALL NOT throw solely because of the first streak

#### Scenario: Probe gateway failure aborts with PaginationError

- **GIVEN** a paginated `client.call` that has shed and completed cooldown after a gateway-failure streak
- **WHEN** the probe page is a gateway failure
- **THEN** the call MUST throw a `PaginationError` including items collected before the failure
- **AND** the client MUST NOT return those items as a successful partial list
- **AND** the client MUST NOT start a second cooldown on that stream

#### Scenario: Second streak after resume aborts without another cooldown

- **GIVEN** a paginated `client.call` that resumed after a successful probe
- **WHEN** a second streak of 3 gateway failures occurs on that stream
- **THEN** the call MUST throw a `PaginationError`
- **AND** the client MUST NOT wait a second cooldown before throwing

#### Scenario: HTTP 429 does not trip the pagination circuit

- **GIVEN** a paginated `client.call` in progress
- **WHEN** a page request receives HTTP 429
- **THEN** the client SHALL follow the existing Retry-After retry path
- **AND** the pagination circuit SHALL NOT shed or cooldown solely because of the 429

#### Scenario: Exhausted non-gateway 5xx still fails immediately

- **GIVEN** a paginated `client.call` in progress
- **WHEN** a page request fails with HTTP 500 after retries are exhausted
- **THEN** the call MUST throw a `PaginationError` without cooldown

#### Scenario: Caller abort during cooldown skips the probe

- **GIVEN** a paginated `client.call` that has shed and is in cooldown
- **WHEN** the caller `abortSignal` aborts before cooldown completes
- **THEN** the call MUST fail
- **AND** the client MUST NOT send the probe page request

---

### Requirement: Paginated page fetches MUST cap retries on gateway failures

Page fetches issued by a paginated `client.call` SHALL use at most **1** retry (`maxRetries` 1) when the error is a gateway failure. Other retryable errors on those page fetches SHALL keep the configured `maxRetries`. Non-paginated `client.call` invocations SHALL keep the configured `maxRetries` for gateway failures.

#### Scenario: Paginated 504 does not consume the full configured retry budget

- **GIVEN** configured `maxRetries` is 20
- **AND** a paginated page request receives HTTP 504
- **WHEN** the page fetch retries according to pagination gateway-failure policy
- **THEN** the client SHALL attempt at most one retry of that page for the gateway failure
- **AND** further 504s on that stream SHALL count toward the pagination circuit streak

#### Scenario: Non-paginated 504 keeps configured retries

- **GIVEN** configured `maxRetries` is 20
- **AND** a non-paginated `client.call` receives HTTP 504
- **WHEN** the queue retries the item
- **THEN** the item SHALL be eligible to retry up to the configured `maxRetries`
- **AND** the pagination circuit SHALL NOT shed other calls

---

## MODIFIED Requirements

### Requirement: Pagination failure semantics MUST be consistent across all modes

All pagination modes (sequential, parallel, searchAfter) MUST throw a `PaginationError` when a page request fails in a way that ends the call, including the number of items successfully collected before the failure. Silent partial-data returns are not permitted. Non-gateway page failures (including exhausted non-504 5xx) MUST throw without cooldown. Gateway failures MUST follow the pagination circuit (shed, one cooldown, one probe) before throwing when the probe fails or a second streak occurs.

#### Scenario: A page failure in any pagination mode throws with context

- **GIVEN** a paginated call is in progress with any mode
- **WHEN** the call ends because of a page failure (immediate non-gateway failure, failed probe, or second gateway-failure streak)
- **THEN** the call throws a `PaginationError` with the error message, the offset/searchAfter position, and the count of items collected before failure
- **AND** the error is not silently swallowed

#### Scenario: Gateway-failure streak does not throw before cooldown and probe

- **GIVEN** a paginated call in any mode that has not yet used its cooldown
- **WHEN** a gateway-failure streak reaches the threshold
- **THEN** the client SHALL shed, cooldown, and probe before throwing
- **AND** a successful probe SHALL NOT throw a `PaginationError` for that streak
