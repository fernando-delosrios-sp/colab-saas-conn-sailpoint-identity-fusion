# client-service Spec

## Purpose

The client service (`src/services/clientService/`) is the queued HTTP client used to talk to SailPoint IdentityIQ / ISC. It serializes outbound requests through a priority-aware `ApiQueue` so the connector can throttle, retry, and shed load without overwhelming the upstream. The same queue is used for both the SDK client and the ISC adapter, and exposes stats (`QueueStats`, `QueuedItemInfo`) for observability. This spec defines the contract for queue behavior, priority ordering, and how queued items are dequeued as upstream capacity becomes available.

## Requirements

### Requirement: The client service MUST serialize outbound HTTP requests through a priority-aware queue

The client service MUST funnel every outbound HTTP call to SailPoint (whether via the SDK client or the ISC adapter) through the shared `ApiQueue`. The queue MUST respect the per-item `QueuePriority`, MUST expose `QueueStats` and `QueuedItemInfo` for observability, and MUST dequeue items as upstream capacity becomes available rather than issuing unbounded parallel requests.

#### Scenario: A queued request is dispatched when capacity is available

- **GIVEN** the queue is empty and a new request is enqueued with `QueuePriority.NORMAL`
- **WHEN** upstream capacity is available
- **THEN** the request is dispatched without blocking the caller longer than the queue's settle time
- **AND** a `QueuedItemInfo` entry is observable via the queue stats

#### Scenario: A high-priority request is dispatched before lower-priority ones

- **GIVEN** the queue has two pending items, one with `QueuePriority.NORMAL` enqueued first
- **WHEN** a new item with `QueuePriority.HIGH` is enqueued
- **THEN** the high-priority item is dispatched before the pre-existing normal-priority item
- **AND** the queue stats reflect the new ordering

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

## Known Exceptions

### `paginateSearchApiGenerator()` remains public

The `call()` method does not support a generator-based searchAfter overload. `identityService.fetchIdentitiesGenerator()` relies on this method for streaming identity pagination via `yield*`. Adding generator support to `call()` requires a new overload and a `_paginateSearchAfterGenerator` helper — deferred to a future iteration.

### `createRetriesConfig()` retained in helpers.ts

This function is used by `sdkApiAdapter.ts` to set `retriesConfig.retries = 0` at the axios SDK level. This disables axios-level retry so the `ApiQueue` is the sole retry authority, preventing double-retry. It is not dead code.
