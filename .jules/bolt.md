## 2026-05-07 - Unbounded Promise.all causes memory and rate-limit issues

**Learning:** `Promise.all` inside candidate enrichment loops (specifically `uncachedIds.map`) mapped over IDs boundlessly, initiating thousands of concurrent asynchronous requests. This resulted in CPU bottlenecks and the potential for triggering external API rate limits.
**Action:** Replaced `Promise.all(ids.map(fn))` with `promiseAllBatched(ids, fn, 50)`, bounding concurrency and saving significant resource cycles. Measured a theoretical execution drop from unmanageable latency at scale to predictable latency (baseline benchmark script Unbounded time: ~27ms vs Batched ~213ms for small arrays, but with safety guarantees over 1000 items).

## 2026-05-07 - Batch Fetching to Resolve N+1 API Pattern

**Learning:** Resolving N+1 fetch issues inside `Promise.all` loops can be efficiently solved by performing a single batch hydrate operation prior to the loop.
**Action:** Added `await this.identities?.hydrateMissingIdentitiesById(validIds)` before mapping over the IDs to ensure subsequent `getIdentityById` calls hit the cache, averting numerous individual fallback `fetchIdentityById` API requests.

## 2026-05-07 - Add SchemaService promise cache to avoid duplicate API calls

**Learning:** Promise.all iterating over independent map functions can trigger multiple consecutive calls of the same asynchronous method across multiple sources sequentially or concurrently, causing N+1 fetching issues.
**Action:** Added `accountSchemasCache` to deduplicate and cache concurrent requests in `fetchAccountSchema` so that any sequential fetches immediately return the cached Promise.

## 2026-05-07 - Batched API calls in schema fetch

**Learning:** `Promise.all(array.map(fn))` triggers unbounded parallel execution which can cause API rate limit or bottleneck issues on heavy lists. Replacing it with an explicit batched approach prevents spikes in API usage.
**Action:** Used the existing utility `promiseAllBatched` from `fusionService/collections` to batch `fetchAccountSchema` operations instead of `Promise.all`, thus limiting concurrency. Replaced `managedSources.reverse()` with `[...managedSources].reverse()` to prevent side-effects since `reverse()` mutates arrays.

## 2025-05-03 - [Parallel Verification API Calls]

**Learning:** Sequential validation and verification API calls when initializing reverse correlation setups introduces unnecessary bottlenecks and latency. By replacing sequential API calls in `getReverseCorrelationSetupStatus` with `Promise.all`, the execution time is reduced.
**Action:** Group independent read-only validation API calls using a single `Promise.all` array and passing `Promise.resolve(true)` for conditionally skipped async checks within the array to maintain parallel execution mapping.

## 2026-05-04 - [Single Lookup Optimization]

**Learning:** The pattern of using Map.has() followed by Map.set() and Map.get() introduces unnecessary double lookups. Using Map.get() first and conditionally initializing missing values avoids redundant operations and is significantly more efficient for operations over large datasets.
**Action:** Replaced Map.has() checks with a single Map.get() call to initialize missing items more efficiently in static initialization blocks.

## 2026-05-07 - [Prevent Heap Allocations in Hot Loops]

**Learning:** Dense domain logic loops that iterate over properties generating arrays on every read (like `Array.from(set)` getters) cause unnecessary heap allocations and garbage collection overhead, particularly inside nested loops (`findFusionAccountByIdentityManagedAccounts`).
**Action:** Extract the intersection logic into a dedicated helper method and iterate over zero-copy native `ReadonlySet` accessors (e.g., `accountIdsSet` and `missingAccountIdsSet`) instead of array-generating getters to eliminate the allocation overhead.

## 2026-05-11 - Batch Fetching to Resolve Sequential Processing Bottlecks

**Learning:** Resolving N+1 sequential fetching bottlenecks inside loop iterations is not limited to modifying the N+1 `Promise.all` logic, sequential execution can also be bottlenecked when waiting on individual async fetching calls like `await this.fetchAccountSchema(source.id)` in a `for...of` loop when the data itself has no required order context.
**Action:** Grouped independent asynchronous calls into a single array utilizing `promiseAllBatched` helper for efficient batch execution instead of awaiting them inside a sequential `for...of` loop where strict ordering of returned schema attributes wasn't required.

## 2026-05-12 - Prevent unbounded parallel execution in forms and identities

**Learning:** `Promise.all(array.map(fn))` triggers unbounded parallel execution which can cause API rate limit or bottleneck issues. Replacing it with an explicit batched approach prevents spikes in API usage.
**Action:** Replaced `Promise.all(forms.map(...))` and `Promise.all(missing.map(...))` with `promiseAllBatched` in `src/services/formService/formService.ts` and `src/services/identityService.ts` to bound concurrency.

## 2026-05-17 - Prevent unbounded parallel execution in source service methods

**Learning:** Unbounded `Promise.all(array.map(fn))` in methods like `fetchManagedAccounts`, `aggregateManagedSources`, and `aggregateDelayedSources` initiates thousands of concurrent asynchronous requests when iterating over potentially large arrays (e.g. `managedSources`). This results in memory exhaustion and external API rate limit triggers.
**Action:** Replaced these unbounded `Promise.all` mapping blocks with `promiseAllBatched` to bound concurrency while maintaining parallel execution benefits.

## 2026-05-18 - Prevent unbounded parallel execution in form service

**Learning:** Unbounded `Promise.all(array.map(fn))` in `src/services/formService/formService.ts` during form instance retrieval initiates concurrent asynchronous requests over arrays (e.g. `activeForms`), which can result in API rate limit triggers when there are a large number of forms.
**Action:** Replaced the unbounded `Promise.all` mapping block with `promiseAllBatched(activeForms, fn)` to bound concurrency while maintaining parallel execution benefits.
