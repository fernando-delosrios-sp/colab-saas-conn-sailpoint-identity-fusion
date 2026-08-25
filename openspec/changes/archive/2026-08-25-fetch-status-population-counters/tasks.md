## 1. Heartbeat STATUS contract (TDD)

- [x] 1.1 Update `src/services/logService/__tests__/operationHeartbeat.test.ts`: Fetch STATUS SHALL render `fusion-accounts=` and `managed-accounts=` on one line (example 42500/102407 and 94044/158951); SHALL omit `identities=` when that counter is unset; SHALL NOT include Fetch `progress=` with unit `fetched` or `ingested`.
- [x] 1.2 Add heartbeat tests: per-population Δ after the first tick that includes that key; identities appearing later SHALL NOT reset managed-accounts Δ; first appearance of fusion-accounts MAY omit its Δ; empty Fusion (no total, done 0) omits `fusion-accounts=`.
- [x] 1.3 Replace tests that format Fetch `progress=… ingested` / fetched→ingested baseline reset. Keep Process `progress=… analyzed` and Refresh `progress=… refreshed`. Fetch→Refresh SHALL omit refreshed Δ on the first Refresh tick.
- [x] 1.4 Implement `OperationRunContext` Fetch population bag, `LogService.setFetchPopulationProgress` (or equivalent), `formatStatusLine` population segments in fusion → managed → identities order, independent baselines, clear bag when leaving Fetch. `setProgress` remains for non-Fetch phases.

## 2. Source and identity writers (TDD)

- [x] 2.1 Update `src/services/sourceService/__tests__/sourceService.test.ts`: managed parallel fetch updates `managed-accounts` (not `setProgress(…, 'fetched')`); Fusion ingest updates `fusion-accounts` (not `setProgress(…, 'ingested')`); empty Fusion does not set `fusion-accounts`; DETAIL `ingesting fusion-accounts` still fires when total > 0.
- [x] 2.2 Update `managedAccountFetcher` to set `managed-accounts` from aggregate registered counts after each page's `setManagedAccount`; stop Fetch `setProgress` unit `fetched`.
- [x] 2.3 Update `fetchFusionAccounts` to set `fusion-accounts` on ingest chunks; stop Fetch `setProgress` units `fetched`/`ingested`; keep yields and ingest DETAIL.
- [x] 2.4 Update `src/services/__tests__/identityService.test.ts`: identity ingest updates `identities`; empty result does not; skipped fetch never sets `identities`; keep ingest DETAIL and yields.
- [x] 2.5 Implement identity Fetch writer to match 2.4.

## 3. Watchdog and other Fetch progress consumers

- [x] 3.1 Update `eventLoopWatchdog.test.ts` (and any other tests asserting Fetch `progress.unit === 'ingested'`) so Fetch starvation still has a STATUS-visible progress snapshot without requiring unit `ingested`.

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test`
- [x] 4.2 Run targeted Vitest files: `operationHeartbeat.test.ts`, `operationRunContext.test.ts`, `sourceService.test.ts`, `identityService.test.ts`, `eventLoopWatchdog.test.ts` (do not pipe the suite to `tail`).
- [x] 4.3 All delta spec scenarios covered by named automated tests (concurrent counters; omit identities when skipped; per-population Δ; omit empty fusion-accounts; managed vs fusion no overwrite; identity empty/skip; Refresh still `progress=… refreshed`).
- [x] 4.4 Run `npm run lint` after the implementation compiles.

## 5. Documentation

- [x] 5.1 Update `docs/reference/observability.md`: Fetch STATUS uses population counters; `fetched`/`ingested` are not the Fetch pipeline fraction; keep DETAIL ingest lines; Refresh/Process `progress=` unchanged.
- [x] 5.2 Update `docs/glossary.md` **Fetch population counter**; revise **Ingested (progress unit)** so it is not the Fetch STATUS `progress=` unit.
- [x] 5.3 Update `docs/operations/account-list.md` Fetch STATUS wording (`fusion-accounts=` / `managed-accounts=` / `identities=`).
- [x] 5.4 Fix Fetch STATUS examples in `docs/use-guides/operation/monitor-aggregation-progress.md` if they still show a single Fetch `progress=… fetched|ingested`.
- [x] 5.5 JSDoc on `setFetchPopulationProgress` (or equivalent) listing allowed population keys.

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via changelog-generator during apply.
- [x] 6.2 Confirm entry covers Fetch STATUS population counters and that scrapers matching Fetch `progress=` / `fetched` / `ingested` must migrate (log-contract change, not Map/Define behavior).
