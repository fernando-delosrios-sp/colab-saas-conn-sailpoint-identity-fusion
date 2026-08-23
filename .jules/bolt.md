## 2026-08-23 - Unbounded Promise.all in sourceAggregation
**Learning:** In the identity-fusion repository, replace unbounded Promise.all mapping over potentially large sets (e.g., iterating through multiple sources) with the promiseAllBatched utility (from fusionService/collections) to prevent memory spikes and API rate limit exhaustion.
**Action:** Use promiseAllBatched for iterating sources and aggregating sources to limit concurrency.
