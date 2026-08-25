## 1. Heartbeat STATUS contract (TDD)

- [x] 1.1 Update `src/services/logService/__tests__/operationHeartbeat.test.ts`: Refresh STATUS SHALL include `progress=… refreshed` with interval delta; SHALL NOT contain `processed(` or standalone `refreshed(N)`; first tick after Fetch→Refresh omits delta; correlation scenario sits next to unit `refreshed`.
- [x] 1.2 Remove `refreshedCount` assertions from heartbeat tests; delete `operationRunContext.test.ts` cases for `incrementRefreshedCount` / `recordRefreshedAccount`.
- [x] 1.3 Implement: `formatStatusLine` SHALL NOT append `refreshed(N)`; delete `recordRefreshedAccount`, `refreshedCount`, and `incrementRefreshedCount` from `logService.ts` / `operationRunContext.ts` and the `LogService` interface.

## 2. batchProcess progress unit

- [x] 2.1 Add a failing `collections.test.ts` case: `batchProcess` default unit remains `processed`; optional `progressUnit` `'refreshed'` is passed through to `setProgress`.
- [x] 2.2 Add optional `progressUnit` (default `'processed'`) to `batchProcess` / `createBatchProgressUpdater` in `src/services/fusionService/collections.ts`.
- [x] 2.3 Pass `'refreshed'` from `FusionService.processFusionAccounts`; leave identity, decision, and correlated-sweep `batchProcess` callers on the default.
- [x] 2.4 Remove `this.log.recordRefreshedAccount()` from `processFusionAccount`.

## 3. Ubiquitous language (change specs stay source until archive)

- [x] 3.1 Add **Refreshed (progress unit)** to `openspec/specs/ubiquitous-language/spec.md` Canonical Terms (operations table) to match the delta spec (apply may also wait for archive sync — do the glossary row so docs and code comments can cite it).

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test`
- [x] 4.2 Run targeted Vitest files: `operationHeartbeat.test.ts`, `operationRunContext.test.ts`, `collections.test.ts` (do not pipe the suite to `tail`).
- [x] 4.3 All delta spec scenarios covered by named automated tests (Refresh unit/delta/baseline; no `refreshed(N)`; correlation alongside `refreshed` unit; Process default `processed`).
- [x] 4.4 Run `npm run lint` after the implementation compiles.

## 5. Documentation

- [x] 5.1 Update `docs/reference/observability.md` STATUS progress units: Refresh uses `refreshed`; do not list a standalone `refreshed(N)`; keep `processed` for Process `batchProcess` only.
- [x] 5.2 Update `docs/glossary.md` with **Refreshed (progress unit)** next to **Ingested (progress unit)**.
- [x] 5.3 Update `docs/operations/account-list.md` Phase 3: STATUS `progress=done/total refreshed`.
- [x] 5.4 Fix stale STATUS examples in `docs/use-guides/operation/monitor-aggregation-progress.md` if they still show Refresh `processed` / `refreshed(N)` or obsolete `phase=4` compact lines that contradict observability.
- [x] 5.5 JSDoc on `batchProcess` `progressUnit` (default `processed`).

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via changelog-generator during apply.
- [x] 6.2 Confirm entry covers Refresh STATUS `progress=… refreshed(Δ…)` and removal of `refreshed(N)` (log-contract change, not a Map/Define behavior change).
