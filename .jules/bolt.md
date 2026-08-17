## 2024-08-17 - Bounding source fetch concurrency
**Learning:** Unbounded Promise.all over multiple sources risks memory spikes and API rate limit exhaustion.
**Action:** Replace unbounded Promise.all mapping over potentially large sets of sources with the promiseAllBatched utility from fusionService/collections.
