## 2026-08-19 - Replaced unbounded Promise.all mapping over multiple sources
**Learning:** Found instances where unbounded `Promise.all` was used to map over a potentially large list of sources.
**Action:** Replaced them with the existing `promiseAllBatched` utility from `fusionService/collections.ts` with a batch size of 10 to prevent unbounded concurrency that could lead to API rate limit exhaustion and memory spikes.
