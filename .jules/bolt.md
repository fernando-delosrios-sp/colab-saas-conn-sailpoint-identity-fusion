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
