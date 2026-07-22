## MODIFIED Requirements

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

#### Scenario: External code cannot access raw SDK APIs

- **GIVEN** a service has a reference to `ClientService`
- **WHEN** the service attempts to access `client.accountsApi`
- **THEN** TypeScript emits a compile error (property is private)
- **AND** the only way to invoke an API call is through `client.call()`
