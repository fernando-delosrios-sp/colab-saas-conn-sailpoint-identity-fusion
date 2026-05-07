## 2026-05-07 - Add SchemaService promise cache to avoid duplicate API calls
**Learning:** Promise.all iterating over independent map functions can trigger multiple consecutive calls of the same asynchronous method across multiple sources sequentially or concurrently, causing N+1 fetching issues.
**Action:** Added `accountSchemasCache` to deduplicate and cache concurrent requests in `fetchAccountSchema` so that any sequential fetches immediately return the cached Promise.
