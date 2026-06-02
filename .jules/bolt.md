## 2024-06-02 - Performance Optimization / Array.from heap allocation
**Learning:** `Array.from()` creates unnecessary heap allocations and garbage collection overhead, especially in hot loops or when applied to iterators like `.values()` or `Set`.
**Action:** Iterate Set/Map directly using a `for...of` loop to prevent `Array.from` heap allocation.
