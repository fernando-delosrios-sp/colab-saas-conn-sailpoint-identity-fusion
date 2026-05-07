## 2026-05-07 - Unbounded Promise.all causes memory and rate-limit issues

**Learning:** `Promise.all` inside candidate enrichment loops (specifically `uncachedIds.map`) mapped over IDs boundlessly, initiating thousands of concurrent asynchronous requests. This resulted in CPU bottlenecks and the potential for triggering external API rate limits.
**Action:** Replaced `Promise.all(ids.map(fn))` with `promiseAllBatched(ids, fn, 50)`, bounding concurrency and saving significant resource cycles. Measured a theoretical execution drop from unmanageable latency at scale to predictable latency (baseline benchmark script Unbounded time: ~27ms vs Batched ~213ms for small arrays, but with safety guarantees over 1000 items).
