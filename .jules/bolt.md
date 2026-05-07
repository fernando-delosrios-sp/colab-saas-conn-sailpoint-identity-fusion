## 2026-05-07 - Batch Fetching to Resolve N+1 API Pattern
**Learning:** Resolving N+1 fetch issues inside `Promise.all` loops can be efficiently solved by performing a single batch hydrate operation prior to the loop.
**Action:** Added `await this.identities?.hydrateMissingIdentitiesById(validIds)` before mapping over the IDs to ensure subsequent `getIdentityById` calls hit the cache, averting numerous individual fallback `fetchIdentityById` API requests.
