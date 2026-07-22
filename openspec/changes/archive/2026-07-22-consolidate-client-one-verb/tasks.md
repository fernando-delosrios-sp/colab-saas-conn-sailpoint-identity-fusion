## 1. Add `call()` alongside existing API

- [x] 1.1 Define `CallPolicy` and `PaginatePolicy` types in `src/services/clientService/types.ts`
- [x] 1.2 Define `IscApiSurface` interface (same shape as current `IscApiAdapter` but used as the callback parameter type)
- [x] 1.3 Implement `call()` method with overloads (single / paginate-sequential / paginate-parallel / paginate-searchAfter)
- [x] 1.4 Internally delegate `call()` to the existing `execute()` for single calls and to a unified paginate loop for paginated calls
- [x] 1.5 Unify pagination failure semantics: all modes throw `PaginationError` on page failure with collected-count context
- [x] 1.6 Add tests for `call()` covering single, sequential paginate, parallel paginate, searchAfter paginate, and failure modes

## 2. Fix the 3 raw bypasses

- [x] 2.1 Wrap `executeFetchMembers` in `client.execute()` with queue routing
- [x] 2.2 Wrap `executeListAccounts` in `client.execute()` with queue routing
- [x] 2.3 Wrap `executeListSources` in `client.execute()` with queue routing
- [x] 2.4 Verify existing sourceService tests pass with the fix

## 3. Migrate callers to `call()` — one service at a time

- [x] 3.1 `SourceService`: replace all `executeXxx` wrappers + direct calls with `client.call()`
- [x] 3.2 `IdentityService`: replace `executeUpdateAccount` + `executeListIdentityAttributes` with `client.call()`
- [x] 3.3 `FormService`: replace all 6 `executeXxx` wrappers with `client.call()`
- [x] 3.4 `MessagingService`: replace all 5 `executeXxx` wrappers with `client.call()`
- [x] 3.5 `FusionService`: (no client usage — no changes needed)
- [x] 3.6 Update test harnesses (`FakeApiAdapter`, `mockRegistry`) to work with `call()` instead of getters

## 4. Remove old API surface

- [x] 4.1 Make all 13 SDK getters private on `ClientService`
- [x] 4.2 Make `execute()`, `paginate()`, `paginateSearchApi()`, `paginateParallel()` private (kept `paginateSearchApiGenerator()` public for generator-based pagination)
- [x] 4.3 Remove all per-service `executeXxx` wrapper methods (23 wrappers deleted across 4 services)
- [x] 4.4 Run full test suite and lint to confirm no remaining references
- [x] 4.5 Delete dead throttle path from `helpers.ts` (`createThrottleConfig()` removed; `createRetriesConfig()` retained as it configures axios to disable retry at SDK level)
