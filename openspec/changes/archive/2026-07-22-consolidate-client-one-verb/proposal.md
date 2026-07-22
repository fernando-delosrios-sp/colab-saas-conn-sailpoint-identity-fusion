## Why

"How an ISC API call behaves" has no locality: retryability is decided in `helpers.shouldRetry`, delay in `helpers.calculateRetryDelay`, the loop in `queue.executeRequest`, timeout and error normalization in `clientService.execute`, and priority at each of ~25 per-service wrappers. Meanwhile, 13 raw SDK getters on `ClientService` let callers silently bypass the entire policy layer (3 already do: `executeFetchMembers`, `executeListAccounts`, `executeListSources`), and 4 pagination entry points have divergent failure semantics — `paginate()` throws on page failures while `paginateSearchApiGenerator()` and `paginateParallel()` swallow them silently.

## What Changes

**ClientService public surface**
- From: 13 SDK getters (`accountsApi`, `searchApi`, `sourcesApi`, ...) + 4 pagination methods (`execute`, `paginate`, `paginateSearchApi`, `paginateParallel`)
- To: One entry point — `call(fn, policy)` — with pagination expressed as a policy discriminator (`paginate: { mode: 'sequential' | 'parallel' | 'searchAfter' }`)
- Reason: No silent policy bypass; every API invocation goes through queue + retry + timeout
- Impact: Breaking — all direct getter access and execute-wrapper calls must migrate to `call()`

**Pagination failure semantics**
- From: `paginate()` throws on page failure; `paginateSearchApiGenerator()` and `paginateParallel()` swallow errors silently
- To: All pagination modes throw on page failure with context (how many items collected before failure)
- Reason: Silent partial data is a correctness bug
- Impact: Callers that relied on silent failure will now receive errors (correct behavior)

**3 raw bypasses fixed**
- From: `executeFetchMembers`, `executeListAccounts`, `executeListSources` call SDK directly
- To: All three route through the queue via the internal `_execute()`
- Reason: Bug fix — they look like they use the queue but don't
- Impact: These calls now respect rate limits, retry policy, and timeouts

**~25 per-service execute wrappers removed**
- From: Each service defines `executeXxx()` wrappers (10-line boilerplate per API call)
- To: Callers invoke `client.call()` directly at the call site
- Reason: Removes ~250 lines of boilerplate; policy is centralized
- Impact: Non-breaking — wrapper removal follows migration; call sites change inline

## Capabilities

### New Capabilities
- (None — this is a consolidation of existing behavior under one contract)

### Modified Capabilities
- `client-service`: Public API surface reduced from 13 getters + 4 pagination methods to a single `call()` entry point with policy-driven pagination. All calls route through queue, retry, and timeout. Pagination failure semantics unified across all modes.

## Impact

- **Affected code:** `src/services/clientService/` (all files), `src/services/sourceService/sourceService.ts`, `src/services/identityService.ts`, `src/services/formService/formService.ts`, `src/services/messagingService/messagingService.ts`, `src/services/fusionService/fusionService.ts`, `src/operations/` (test harnesses: `fakeApiAdapter.ts`, `mockRegistry.ts`)
- **Migration:** 3-step incremental migration (add `call()` alongside existing API → migrate callers service by service → remove old API and make getters private)
- **Tests:** All `__tests__/` directories that stub `ClientService` getters or `execute*` wrappers need updating
