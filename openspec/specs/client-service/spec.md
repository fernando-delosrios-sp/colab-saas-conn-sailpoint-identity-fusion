# client-service Spec

## Purpose

The client service (`src/services/clientService/`) is the queued HTTP client used to talk to SailPoint IdentityIQ / ISC. It serializes outbound requests through a priority-aware `ApiQueue` so the connector can throttle, retry, and shed load without overwhelming the upstream. The same queue is used for both the SDK client and the ISC adapter, and exposes stats (`QueueStats`, `QueuedItemInfo`) for observability. This spec defines the contract for queue behavior, priority ordering, and how queued items are dequeued as upstream capacity becomes available.
## Requirements
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

### Requirement: The client service MUST expose a single public entry point for all ISC API calls

The `ClientService` public surface MUST be a single method `call(fn, policy?)` that routes every outbound ISC API invocation through the queue, retry, and timeout layers. The method MUST NOT expose raw SDK API instances as public getters. The `fn` callback receives a typed `IscApiSurface` parameter so TypeScript inference preserves the return type.

#### Scenario: A single API call is routed through the policy layer

- **GIVEN** a caller invokes `client.call((api) => api.accounts.updateAccount(req).then(r => r.data), { priority: QueuePriority.LOW })`
- **WHEN** the queue has capacity
- **THEN** the request is enqueued with `QueuePriority.LOW`, wrapped in the configurable timeout, and retried per the queue's retry policy on failure
- **AND** no raw SDK getter is reachable from outside `ClientService`

#### Scenario: A paginated call collects all pages sequentially

- **GIVEN** a caller invokes `client.call((api, params) => api.accounts.listAccounts(params), { paginate: { mode: 'sequential', baseParams: { filters: '...' } } })`
- **WHEN** there are multiple pages of results
- **THEN** all pages are fetched sequentially through the queue and returned as a single `T[]` array
- **AND** each page request inherits the caller's policy (priority, context, noRetry)

#### Scenario: A paginated call collects pages in parallel batches

- **GIVEN** a caller invokes `client.call((api, params) => api.accounts.listAccounts(params), { paginate: { mode: 'parallel', baseParams: { filters: '...' }, batchSize: 8 } })`
- **WHEN** there are multiple pages of results
- **THEN** pages are fetched in parallel batches and yielded via an `AsyncGenerator<T[]>`
- **AND** each page request inherits the caller's policy

#### Scenario: A searchAfter paginated call respects SailPoint search semantics

- **GIVEN** a caller invokes `client.call((api) => api.search.searchPost({ search, limit, count }).then(r => r.data), { paginate: { mode: 'searchAfter', search } })`
- **WHEN** there are multiple pages of search results
- **THEN** pages are fetched using `searchAfter` cursors (not offset), with the first request using `count=true`
- **AND** each page request inherits the caller's policy

### Requirement: Pagination failure semantics MUST be consistent across all modes

All pagination modes (sequential, parallel, searchAfter) MUST throw a `PaginationError` when any page request fails, including the number of items successfully collected before the failure. Silent partial-data returns are not permitted.

#### Scenario: A page failure in any pagination mode throws with context

- **GIVEN** a paginated call is in progress with any mode
- **WHEN** a page request fails
- **THEN** the call throws a `PaginationError` with the error message, the offset/searchAfter position, and the count of items collected before failure
- **AND** the error is not silently swallowed

### Requirement: SDK API getters MUST NOT be publicly accessible

The 13 SDK API instances (`accountsApi`, `identitiesApi`, `searchApi`, `sourcesApi`, `customFormsApi`, `workflowsApi`, `entitlementsApi`, `transformsApi`, `governanceGroupsApi`, `taskManagementApi`, `identityProfilesApi`, `identityAttributesApi`, and `config`) MUST be private members of `ClientService`. No external caller may obtain a reference to a raw SDK API instance.

A public `accessToken` getter is provided for services that need to resolve API bearer tokens (previously accessed via `client.config.accessToken`).

#### Scenario: External code cannot access raw SDK APIs

- **GIVEN** a service has a reference to `ClientService`
- **WHEN** the service attempts to access `client.accountsApi`
- **THEN** TypeScript emits a compile error (property is private)
- **AND** the only way to invoke an API call is through `client.call()`

#### Scenario: Services can resolve API tokens without accessing raw config

- **GIVEN** a service needs an API access token
- **WHEN** the service accesses `client.accessToken`
- **THEN** the access token value (string, function, or promise) is returned
- **AND** no raw `Configuration` object is exposed

### Requirement: The SDK adapter MUST configure bounded HTTPS socket pool limits

`SdkApiAdapter` SHALL inject an `https.Agent` into the SailPoint SDK `Configuration` with HTTP keep-alive enabled and explicit connection pool bounds. The agent MUST set `keepAlive: true`, `keepAliveMsecs: 30000`, `maxSockets: 50`, `maxFreeSockets: 10`, and `timeout: 60000`. All SDK API instances MUST share this single agent via `baseOptions.httpsAgent`.

#### Scenario: SdkApiAdapter constructs a bounded keep-alive agent

- **GIVEN** a `FusionConfig` with a valid ISC base URL
- **WHEN** `SdkApiAdapter` is instantiated
- **THEN** the SDK `Configuration` SHALL include an `httpsAgent` with `keepAlive` enabled
- **AND** the agent SHALL have `maxSockets` set to 50
- **AND** the agent SHALL have `maxFreeSockets` set to 10
- **AND** the agent SHALL have `keepAliveMsecs` set to 30000
- **AND** the agent SHALL have `timeout` set to 60000

#### Scenario: All SDK API calls reuse the shared bounded agent

- **GIVEN** an instantiated `SdkApiAdapter`
- **WHEN** any lazy-loaded SDK API getter (e.g. `accountsApi`, `searchApi`) is accessed
- **THEN** the underlying HTTP client SHALL use the same shared `httpsAgent` from `Configuration.baseOptions`
- **AND** outbound requests SHALL continue to route through the client service queue unchanged

### Requirement: Queue statistics are consumed by operation heartbeat not standalone logging

The client service SHALL expose queue statistics and active item information via `getQueueStats()` and `getQueueItems()` for operation heartbeat consumption. The client service SHALL NOT emit standalone periodic `Queue Stats:` log lines when an operation heartbeat is active for the current registry context.

#### Scenario: No standalone queue stats interval during account-list

- **GIVEN** an account-list operation with an active operation heartbeat
- **WHEN** the run exceeds two heartbeat intervals
- **THEN** log output SHALL NOT contain standalone lines beginning with `Queue Stats:`
- **AND** queue statistics SHALL appear inside `STATUS` heartbeat lines instead

#### Scenario: Queue stats API remains available

- **GIVEN** any connector operation using the shared API queue
- **WHEN** a caller invokes `client.getQueueStats()`
- **THEN** current queue statistics SHALL be returned regardless of heartbeat state

### Requirement: Parallel pagination MUST maintain a sliding window of in-flight page requests

When `client.call()` uses `paginate: { mode: 'parallel' }`, the client service SHALL schedule page fetches with a sliding window of up to `windowSize` concurrent in-flight page requests per pagination stream, where `windowSize` is `paginate.batchSize` when set, otherwise the configured `parallelBatchSize`. When any in-flight page completes, the client service SHALL enqueue the next unresolved page offset (if any remain) without waiting for all in-flight pages in the current window to complete. Completed pages SHALL be yielded to the `AsyncGenerator` consumer in ascending offset order. Each page request SHALL inherit the caller's policy (priority, context, abortSignal, noRetry). The global `ApiQueue` SHALL continue to enforce `maxConcurrentRequests` and rate-window limits across all streams.

#### Scenario: Next page starts when a slot frees before the window completes

- **GIVEN** parallel pagination with `windowSize` 10 and multiple remaining page offsets
- **AND** nine of ten in-flight pages complete quickly while one page remains slow
- **WHEN** a concurrency slot becomes available
- **THEN** the client service SHALL schedule the next unresolved page offset without waiting for the slow page's nine fast siblings to have been part of a completed batch barrier
- **AND** total in-flight page requests for the stream SHALL NOT exceed `windowSize`

#### Scenario: Parallel pagination yields pages in ascending offset order

- **GIVEN** parallel pagination where page at offset 500 completes before page at offset 250
- **WHEN** both pages have completed
- **THEN** the generator SHALL yield the offset 250 page before the offset 500 page
- **AND** no caller-visible reordering of account batches by completion time alone SHALL occur

#### Scenario: onPageProgress fires after each page completes

- **GIVEN** a parallel paginated call with `onPageProgress` configured
- **WHEN** each page fetch completes successfully
- **THEN** `onPageProgress` SHALL be invoked with a monotonically non-decreasing loaded item count
- **AND** the callback SHALL NOT be deferred until an entire fixed batch barrier completes

---

### Requirement: parallelBatchSize MUST NOT be capped to maxConcurrentRequests at construction

`ClientService` SHALL store the configured `parallelBatchSize` (default 12) without applying `Math.min(parallelBatchSize, maxConcurrentRequests)`. The connector-spec help text SHALL describe `parallelBatchSize` as the maximum in-flight parallel pages per pagination stream and `maxConcurrentRequests` as the global concurrent HTTP limit enforced by the shared queue.

#### Scenario: parallelBatchSize greater than maxConcurrentRequests is preserved

- **GIVEN** Advanced Connection Settings with `parallelBatchSize` 16 and `maxConcurrentRequests` 10
- **WHEN** `ClientService` is constructed
- **THEN** the effective parallel pagination window size SHALL be 16 (unless overridden by `paginate.batchSize`)
- **AND** the global queue SHALL still enforce at most 10 concurrent in-flight HTTP requests across all callers

### Requirement: Client service SHALL support a DryRunApiAdapter for write inhibition

When dry-run mode is active on account-list, `ServiceRegistry` SHALL wrap the live `SdkApiAdapter` with a `DryRunApiAdapter`. The adapter SHALL delegate all read API calls to the inner adapter unchanged. The adapter SHALL inhibit all write API calls (using shared write-method classification) without calling the inner adapter, and SHALL return synthetic responses from an in-memory shadow store so callers that assert on returned IDs can continue.

#### Scenario: Read calls delegate to live SDK

- **GIVEN** dry-run mode is active and `DryRunApiAdapter` wraps `SdkApiAdapter`
- **WHEN** a read API method (e.g. `listAccounts`, `getSource`) is invoked
- **THEN** the inner `SdkApiAdapter` SHALL receive the call
- **AND** the live response SHALL be returned to the caller

#### Scenario: Write calls are inhibited

- **GIVEN** dry-run mode is active
- **WHEN** a write API method (e.g. `updateAccount`, `updateSource`, `createFormDefinition`) is invoked
- **THEN** the inner `SdkApiAdapter` SHALL NOT receive the call
- **AND** the adapter SHALL return a synthetic response without mutating the ISC tenant

#### Scenario: Synthetic form responses include IDs

- **GIVEN** dry-run mode is active
- **WHEN** `createFormDefinition` or `createFormInstance` is invoked
- **THEN** the synthetic response SHALL include an `id` field
- **AND** downstream FormService assertions SHALL succeed

### Requirement: Write-method classification SHALL be shared between replay and dry-run adapters

The connector SHALL extract write-method detection from `ReplayApiAdapter` into a shared module. Both `ReplayApiAdapter` and `DryRunApiAdapter` SHALL import the same classification so replay and dry-run agree on which methods are writes.

#### Scenario: Replay and dry-run classify the same method as a write

- **GIVEN** an API method name classified as a write (e.g. `updateSource`)
- **WHEN** either `ReplayApiAdapter` or `DryRunApiAdapter` handles a call to that method
- **THEN** both adapters SHALL treat it as a write (replay: recorded response; dry-run: inhibited with synthetic response)

### Requirement: ServiceRegistry SHALL activate dry-run adapter at accountList entry

`ServiceRegistry` SHALL expose `activateDryRunMode()` to wrap the client adapter before any account-list phase issues API calls. Activation SHALL occur at the start of `accountList` after parsing `dryRun.enabled`, because the registry is constructed before input is available.

#### Scenario: Adapter activated before setup phase API calls

- **GIVEN** an account-list invocation with `{ dryRun: { enabled: true } }`
- **WHEN** `accountList` begins execution
- **THEN** `activateDryRunMode()` SHALL be called before Setup phase API calls
- **AND** all subsequent `ClientService.call()` invocations SHALL route through `DryRunApiAdapter`

## Known Exceptions

### `paginateSearchApiGenerator()` remains public

The `call()` method does not support a generator-based searchAfter overload. `identityService.fetchIdentitiesGenerator()` relies on this method for streaming identity pagination via `yield*`. Adding generator support to `call()` requires a new overload and a `_paginateSearchAfterGenerator` helper — deferred to a future iteration.

### `createRetriesConfig()` retained in helpers.ts

This function is used by `sdkApiAdapter.ts` to set `retriesConfig.retries = 0` at the axios SDK level. This disables axios-level retry so the `ApiQueue` is the sole retry authority, preventing double-retry. It is not dead code.

