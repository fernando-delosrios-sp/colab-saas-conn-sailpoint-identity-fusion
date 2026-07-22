## Context

`ClientService` currently exposes two surface areas: 4 pagination methods (`execute`, `paginate`, `paginateSearchApi`, `paginateParallel`) and 13 raw SDK getters (`accountsApi`, `searchApi`, ...). Callers must know whether to use `execute()` for single calls, `paginate()` for offset-based listing, `paginateSearchApi()` for searchAfter, or `paginateParallel()` for high-throughput — and whether to access a getter directly (bypassing policy). This design collapses both surfaces into one verb with a policy discriminator.

The `IscApiAdapter` interface already provides the adapter seam; both `SdkApiAdapter` (production) and `FakeApiAdapter` (tests) implement it. The consolidation leverages this existing seam.

## Goals / Non-Goals

**Goals:**
- Single public entry point `call(fn, policy)` for all ISC API invocations
- Pagination strategy expressed as a policy discriminator (`paginate.mode`)
- Consistent failure semantics across all pagination modes (throw, never swallow)
- No raw SDK getters reachable from outside `ClientService`
- Incremental migration: `call()` coexists with existing API during transition

**Non-Goals:**
- Changing the queue internals (`ApiQueue`, retry logic, throttling) — those stay as-is
- Auto-unwrapping SDK response shapes (`.data` extraction) — caller controls this in the callback
- Adding new pagination modes beyond sequential / parallel / searchAfter
- Modifying the adapter interface (`IscApiAdapter`)

## Decisions

### D1: Single `call()` method with overloads vs. separate methods for pagination

- **Choice**: Single `call()` with TypeScript overloads discriminated by `paginate` field presence
- **Reason**: Prevents callers from accidentally using the wrong method for their use case. The type system narrows the return type and callback signature based on policy fields. One entry point = one place to enforce policy.
- **Alternatives considered**: Separate `paginate()` / `search()` methods alongside `call()`. Rejected because it reproduces the current problem (multiple entry points, caller must know which to use) with different names.

### D2: Policy as a single object vs. positional parameters

- **Choice**: Single `CallPolicy` object with named fields
- **Reason**: Current `execute()` takes 6 positional params (`apiFunction, priority, context, abortSignal, throwOnError, noRetry`) — callers frequently forget the order or pass `undefined` for skipped params. A named object is self-documenting and extensible.
- **Alternatives considered**: Keep positional but with a config object as the last param. Rejected — two different calling conventions (positional for "simple" calls, object for "complex") is worse than one consistent convention.

### D3: Response normalization — caller vs. framework

- **Choice**: Caller normalizes in the callback (`api => api.accounts.updateAccount(p).then(r => r.data)`)
- **Reason**: SDK response shapes vary (`.data`, `.data?.results`, raw array, wrapped in `{ data: ... }`). Auto-unwrapping would need per-method knowledge or heuristics that break when the SDK version changes. The `.then()` chain is 10 characters — not worth abstracting.
- **Alternatives considered**: `unwrap: 'data'` policy flag. Rejected — fragile, fails silently when SDK changes, and the caller still needs to know which unwrap mode to pick (shifting the knowledge burden without reducing it).

### D4: Pagination failure — always throw vs. configurable

- **Choice**: Always throw `PaginationError` on any page failure, including items-collected count
- **Reason**: Current `paginateSearchApiGenerator()` and `paginateParallel()` silently return partial data on page failure — this is a correctness bug, not a feature. No caller intentionally relies on partial data. Making it configurable adds complexity without a use case.
- **Alternatives considered**: `failOnPageError: false` policy flag for callers that want best-effort collection. Rejected — no known caller needs this; YAGNI.

### D5: `call()` return type for single calls

- **Choice**: `Promise<T | undefined>` (return `undefined` on failure when `throwOnError` is false)
- **Reason**: Mirrors current `execute()` behavior. Many callers use `if (!result) return` guards. Changing to always-throw would require updating every call site's error handling.
- **Alternatives considered**: Always return `Promise<T>` and throw. Rejected — too many call sites rely on the undefined-on-failure pattern for control flow (e.g., skipping optional operations).

### D6: `IscApiSurface` shape passed to callback

- **Choice**: Same shape as `IscApiAdapter` but passed as callback parameter (not stored as reference)
- **Reason**: The callback pattern naturally scopes the API reference — callers can't capture it and use it later outside the policy layer. TypeScript infers the return type from the callback's return value.
- **Alternatives considered**: Proxy-based getters that auto-enqueue. Rejected — breaks type inference for chained calls and adds runtime overhead.

## Risks / Trade-offs

- [Risk] Migration touches ~25 call sites across 5 services — Mitigation: 3-step incremental migration; `call()` coexists with old API; each service migrates independently with its own test suite as safety net.
- [Trade-off] Callers now write `.then(r => r.data)` inline at every call site vs. having it in a shared wrapper. Accept because it eliminates 250 lines of wrapper boilerplate and the normalization varies per API anyway.
- [Trade-off] The `paginate` policy callback takes an extra `params` argument, making the single-call and paginated-call signatures different. Accept because TypeScript overloads make this transparent at the call site; the type checker guides correct usage.
- [Risk] Test harnesses (`FakeApiAdapter`, mock stubs) currently expose getters — Mitigation: update harnesses in Step 3 of migration, after all production callers have moved.

## Migration Plan

3-step incremental deployment:

1. **Add `call()`** — new method lives alongside existing API. No caller changes. Tests verify both paths work.
2. **Migrate callers** — one service at a time (SourceService → IdentityService → FormService → MessagingService → FusionService). Each service PR is self-contained with its own test suite.
3. **Remove old API** — make getters private, remove `execute`/`paginate`/`paginateSearchApi`/`paginateParallel`, delete dead throttle paths. Final PR with full test suite.

Rollback: revert Step 3 (restore old API) — callers already migrated to `call()` in Step 2 are unaffected since `call()` wraps the same internal queue.

## Open Questions

- (None — all design forks resolved above)
