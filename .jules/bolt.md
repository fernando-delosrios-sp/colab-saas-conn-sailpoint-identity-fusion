## 2024-05-18 - Replacing Unbounded Promise.all with promiseAllBatched
**Learning:** Using `Promise.all` with `.map` over unbounded sets (like missing account IDs) causes all promises to be created simultaneously, which can hold all intermediate results in memory and risk API rate limits.
**Action:** Replace unbounded `Promise.all` mapping with `promiseAllBatched` (from `fusionService/collections`) to batch and bound peak memory usage and prevent API rate limits.
