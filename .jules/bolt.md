## 2026-05-07 - Batched API calls in schema fetch
**Learning:** `Promise.all(array.map(fn))` triggers unbounded parallel execution which can cause API rate limit or bottleneck issues on heavy lists. Replacing it with an explicit batched approach prevents spikes in API usage.
**Action:** Used the existing utility `promiseAllBatched` from `fusionService/collections` to batch `fetchAccountSchema` operations instead of `Promise.all`, thus limiting concurrency. Replaced `managedSources.reverse()` with `[...managedSources].reverse()` to prevent side-effects since `reverse()` mutates arrays.
