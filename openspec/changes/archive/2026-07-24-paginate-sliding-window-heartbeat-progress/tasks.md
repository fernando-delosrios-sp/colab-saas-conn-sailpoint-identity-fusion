## 1. ClientService sliding-window pagination

- [x] 1.1 Extract a shared sliding-window helper (schedule offsets, track in-flight, reorder buffer for ascending yields) in `clientService.ts`
- [x] 1.2 Refactor `_paginateParallel` to use the helper; invoke `onPageProgress` per page completion
- [x] 1.3 Refactor legacy `paginateParallelGenerator` overload to use the same helper
- [x] 1.4 Remove `Math.min(parallelBatchSize, maxConcurrentRequests)` cap in constructor; update startup log message if needed
- [x] 1.5 Add unit tests: straggler starts next offset early, ascending yield order, per-page progress callbacks, windowSize from config

## 2. SourceService fetch progress

- [x] 2.1 Verify `fetchManagedAccounts` / `fetchFusionAccounts` aggregate `onPageProgress` receives per-page updates after ClientService change
- [x] 2.2 Add or extend tests asserting aggregate `setProgress` calls increment on page boundaries (mock client generator)

## 3. Configuration and documentation

- [x] 3.1 Update `connector-spec.json` help text for `parallelBatchSize` (in-flight pages per stream vs global concurrency)
- [x] 3.2 Update `docs/guides/advanced-connection-settings.md` with sliding-window semantics and tuning guidance
- [x] 3.3 Add CHANGELOG entry under Performance / Observability

## 4. Verification

- [x] 4.1 Run `npm test` for clientService and sourceService test files
- [x] 4.2 Run `npm run lint`
- [x] 4.3 Capture before/after Fetch duration note in change `verify.md` (ITKEYS-scale scenario or test proxy)
