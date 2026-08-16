## 2024-08-16 - Replacing unbounded Promise.all with promiseAllBatched
**Learning:** Found multiple usages of unbounded `Promise.all` iterating over `managedSources`, `aggregationChecks` and `delayedSources` in `src/services/sourceService/sourceAggregator.ts`, which could lead to memory spikes and API rate limit exhaustion when dealing with a large number of sources.
**Action:** Replace `Promise.all(items.map(fn))` with `promiseAllBatched(items, fn)` from `src/services/fusionService/collections.ts` which provides concurrency limits and bounds peak memory usage when processing API calls.
