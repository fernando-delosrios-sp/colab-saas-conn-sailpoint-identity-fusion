## 2026-08-18 - Replace unbounded Promise.all with promiseAllBatched
**Learning:** In the identity-fusion repository, using unbounded Promise.all for mapping over potentially large sets (like iterating through managed sources for aggregation checks or scheduling) can cause memory spikes and API rate limit exhaustion.
**Action:** Always replace unbounded Promise.all mapping over such sets with the promiseAllBatched utility from fusionService/collections.
