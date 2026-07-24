## 1. Heartbeat formatter and delta tracking

- [x] 1.1 Extract shared `formatDeltaSuffix(current, previous, intervalMs)` in `operationHeartbeat.ts`
- [x] 1.2 Track `previousProgressDone` in `OperationHeartbeat`; reset on stop alongside `previousProcessed`
- [x] 1.3 Update `formatStatusLine` to emit `progress=done/total [unit](Δ±N/interval)` when progress is set
- [x] 1.4 Relabel queue segment to `api-queue active=… queued=… completed=…(Δ±N/interval)`
- [x] 1.5 Update `formatStallWarning` wording to reference api-queue completed count
- [x] 1.6 Extend `operationHeartbeat.test.ts` for dual deltas, first-tick omission, unit suffix, and api-queue relabeling

## 2. Fetch-phase progress instrumentation

- [x] 2.1 Add optional pagination progress callback to ClientService paginate paths used by Fetch (parallel/sequential/searchAfter as needed)
- [x] 2.2 Wire `SourceService.fetchManagedAccounts` and `fetchFusionAccounts` to call `setProgress(loaded, total, 'fetched')` at batch boundaries
- [x] 2.3 Wire `IdentityService.fetchIdentities` pagination to update fetch progress
- [x] 2.4 Wire form-instance fetch pagination to update fetch progress when fetch duration spans heartbeat ticks
- [x] 2.5 Add or extend unit tests for fetch progress updates (source/identity services or integration-style heartbeat snapshot tests)

## 3. Documentation and release notes

- [x] 3.1 Update `docs/concepts/glossary.md` STATUS line and new delta term entries
- [x] 3.2 Update `docs/guides/advanced-connection-settings.md` STATUS line description (`api-queue completed=`, progress delta)
- [x] 3.3 Add CHANGELOG entry noting `queue processed=` → `api-queue completed=` migration for log scrapers

## 4. Validation

- [x] 4.1 Run `npm test` for log-service and affected service tests
- [x] 4.2 Run `npm run lint`
- [x] 4.3 Run `openspec validate heartbeat-progress-delta --strict`
