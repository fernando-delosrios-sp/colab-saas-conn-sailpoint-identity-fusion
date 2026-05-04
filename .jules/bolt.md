## 2025-05-03 - [Parallel Verification API Calls]
**Learning:** Sequential validation and verification API calls when initializing reverse correlation setups introduces unnecessary bottlenecks and latency. By replacing sequential API calls in `getReverseCorrelationSetupStatus` with `Promise.all`, the execution time is reduced.
**Action:** Group independent read-only validation API calls using a single `Promise.all` array and passing `Promise.resolve(true)` for conditionally skipped async checks within the array to maintain parallel execution mapping.

## 2026-05-04 - [Single Lookup Optimization]
**Learning:** The pattern of using Map.has() followed by Map.set() and Map.get() introduces unnecessary double lookups. Using Map.get() first and conditionally initializing missing values avoids redundant operations and is significantly more efficient for operations over large datasets.
**Action:** Replaced Map.has() checks with a single Map.get() call to initialize missing items more efficiently in static initialization blocks.
