## MODIFIED Requirements

### Requirement: ClientService MUST abort in-flight HTTP when provisioning timeout expires

When `provisioningTimeout` is configured, `ClientService` SHALL start a per-attempt timeout when the queued request function begins executing (after rate-limit slot acquisition and before HTTP work starts), not when the request is first enqueued. The timeout abort signal SHALL be merged with any caller `abortSignal` only inside the executing request function. The abort SHALL propagate to the underlying HTTP client so the request does not continue after the timeout rejection. Waiting in the priority FIFO queue or awaiting a rate-limit slot SHALL NOT consume the provisioning timeout budget.

#### Scenario: Timeout aborts slow request

- **GIVEN** `provisioningTimeout` is 1 second
- **AND** a queued API call has started HTTP execution
- **AND** the HTTP call would take 5 seconds to complete
- **WHEN** the per-attempt timeout fires
- **THEN** the promise returned to the caller SHALL reject with a timeout error within approximately 1 second of HTTP start
- **AND** the underlying HTTP request SHALL be aborted (observable via mock or cancellation hook)

#### Scenario: Queued request survives past provisioning timeout before HTTP starts

- **GIVEN** `provisioningTimeout` is 1 second
- **AND** a LOW-priority API call is enqueued while the queue is busy
- **AND** the item remains in the FIFO queue or rate-limiter wait for longer than 1 second
- **WHEN** the item later acquires a rate-limit slot and begins HTTP execution
- **AND** the HTTP call completes successfully within 1 second of execution start
- **THEN** the promise SHALL resolve successfully
- **AND** the request SHALL NOT reject solely because wall time since enqueue exceeded 1 second

#### Scenario: Retry attempt receives fresh timeout budget

- **GIVEN** `provisioningTimeout` is 1 second
- **AND** a queued API call fails with a retryable error after HTTP starts
- **WHEN** the queue re-enqueues the item for a retry attempt
- **THEN** the retry attempt SHALL receive a fresh 1 second timeout budget starting when that attempt begins HTTP execution

#### Scenario: Caller abortSignal still honored

- **GIVEN** a caller passes `abortSignal` to `client.call()`
- **WHEN** the signal is aborted before the HTTP call completes
- **THEN** the queued item SHALL reject with an abort error
- **AND** in-flight HTTP SHALL be cancelled when execution had started

## ADDED Requirements

### Requirement: ApiQueue MUST propagate abort signal reason on rejection

When an `ApiQueue` item is rejected because its `abortSignal` is aborted, the queue SHALL reject with `signal.reason` when it is defined. When `signal.reason` is undefined, the queue MAY reject with a generic abort error.

#### Scenario: Timeout reason preserved when abort fires while queued

- **GIVEN** a queued item's `abortSignal` is aborted with reason `Error: Request timed out after 1000ms`
- **WHEN** the queue removes the item from the pending queue
- **THEN** the rejected promise SHALL carry the timeout reason message
- **AND** the rejection SHALL NOT replace the reason with a generic `Aborted` message when `signal.reason` is defined

### Requirement: ApiQueue MUST expose rate-limiter wait count in queue statistics

`QueueStats` SHALL include `rateLimitWaitCount` representing the number of dequeued items currently awaiting a rate-limit slot before HTTP execution begins. The counter SHALL increment when an item enters rate-limiter wait and decrement when the wait completes or the item is rejected.

#### Scenario: Rate-limiter wait reflected in queue stats

- **GIVEN** 3 items have been dequeued and are awaiting rate-limit slots
- **AND** 2 additional items remain in the FIFO queue
- **WHEN** a caller invokes `getQueueStats()`
- **THEN** `queueLength` SHALL be 2
- **AND** `rateLimitWaitCount` SHALL be 3
