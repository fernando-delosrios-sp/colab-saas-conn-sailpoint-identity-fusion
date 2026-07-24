## ADDED Requirements

### Requirement: ApiQueue MUST enforce a sliding-window rate limit aligned with ISC API limits

The `ApiQueue` SHALL limit the number of request starts within a configurable sliding time window instead of enforcing only uniform inter-request spacing. The default window SHALL be 10 seconds. The default maximum requests per window SHALL be 80. The hard maximum configurable cap SHALL be 100 requests per 10 seconds to align with ISC tenant API limits. When only the legacy `requestsPerSecond` setting is configured, the queue SHALL derive the window maximum as `requestsPerSecond × (windowMs / 1000)`.

#### Scenario: Burst within window is allowed up to cap

- **GIVEN** the rate limiter is configured for 80 requests per 10 second window
- **AND** no requests have been started in the prior 10 seconds
- **WHEN** 80 requests are scheduled to start in quick succession
- **THEN** all 80 SHALL be permitted to start without uniform 100ms spacing between each start
- **AND** the 81st request start within the same window SHALL wait until the window slides

#### Scenario: Legacy requestsPerSecond derives window cap

- **GIVEN** `requestsPerSecond` is set to 6 and no explicit window maximum is configured
- **WHEN** the queue initializes its rate limiter with a 10 second window
- **THEN** the effective window maximum SHALL be 60 request starts per window

### Requirement: ApiQueue MUST count concurrency only for in-flight HTTP work

The `ApiQueue` SHALL increment `activeRequests` only when a queued item begins executing its HTTP function, not while waiting for rate-limit scheduling. Rate-limit waits SHALL NOT consume a concurrency slot.

#### Scenario: Concurrency slots available during rate-limit wait

- **GIVEN** `maxConcurrentRequests` is 20
- **AND** 15 requests are in flight with slow HTTP responses
- **WHEN** additional items are waiting only for rate-limit scheduling (not yet executing HTTP)
- **THEN** `activeRequests` SHALL remain 15
- **AND** new items SHALL be allowed to begin HTTP execution until `activeRequests` reaches 20

### Requirement: ClientService MUST abort in-flight HTTP when provisioning timeout expires

When `provisioningTimeout` is configured, `ClientService.execute()` SHALL attach an abort signal to the queued request and SHALL abort in-flight HTTP work when the timeout elapses. The abort SHALL propagate to the underlying HTTP client so the request does not continue after the timeout rejection.

#### Scenario: Timeout aborts slow request

- **GIVEN** `provisioningTimeout` is 1 second
- **AND** a queued API call would take 5 seconds to complete
- **WHEN** the client timeout fires
- **THEN** the promise returned to the caller SHALL reject with a timeout error within approximately 1 second
- **AND** the underlying HTTP request SHALL be aborted (observable via mock or cancellation hook)

#### Scenario: Caller abortSignal still honored

- **GIVEN** a caller passes `abortSignal` to `client.call()`
- **WHEN** the signal is aborted before the HTTP call completes
- **THEN** the queued item SHALL reject with an abort error
- **AND** in-flight HTTP SHALL be cancelled when execution had started

## MODIFIED Requirements

### Requirement: The client service MUST serialize outbound HTTP requests through a priority-aware queue

The client service MUST funnel every outbound HTTP call to SailPoint (whether via the SDK client or the ISC adapter) through the shared `ApiQueue`. The queue MUST respect the per-item `QueuePriority`, MUST expose `QueueStats` and `QueuedItemInfo` for observability, and MUST dequeue items as upstream capacity becomes available rather than issuing unbounded parallel requests. The queue MUST enforce rate limits via a sliding-window cap on request starts and MUST count `activeRequests` only while HTTP work is in flight.

#### Scenario: A queued request is dispatched when capacity is available

- **GIVEN** the queue is empty and a new request is enqueued with `QueuePriority.MEDIUM`
- **WHEN** upstream capacity is available within the rate-limit window
- **THEN** the request is dispatched without blocking the caller longer than the queue's settle time
- **AND** a `QueuedItemInfo` entry is observable via the queue stats

#### Scenario: A high-priority request is dispatched before lower-priority ones

- **GIVEN** the queue has two pending items, one with `QueuePriority.MEDIUM` enqueued first
- **WHEN** a new item with `QueuePriority.HIGH` is enqueued
- **THEN** the high-priority item is dispatched before the pre-existing medium-priority item
- **AND** the queue stats reflect the new ordering

#### Scenario: Rate window blocks excess starts

- **GIVEN** the sliding window maximum has been reached for the current window
- **AND** concurrency slots remain available
- **WHEN** another item is ready to start
- **THEN** the item SHALL wait for rate-limit capacity before beginning HTTP execution
