## 1. Chunked yield helper

- [x] 1.1 Add `forEachChunked` to `src/utils/yieldToEventLoop.ts` (default chunk size 250, `await yieldToEventLoop()` after each chunk, optional `onProgress(done, total)`).
- [x] 1.2 Add tests in `src/utils/__tests__/yieldToEventLoop.test.ts` (or extend `collections.test.ts` if that file remains the yield test home): chunk boundaries, empty array, N ≤ 250 single chunk + one yield, `setImmediate` invoked between chunks.

## 2. Client collect-all pagination

- [x] 2.1 In `paginateSearchAfter`, `await yieldToEventLoop()` after each page append; keep `onPageProgress`.
- [x] 2.2 In `fetchSequentialOffsetPages`, `await yieldToEventLoop()` after each page append; keep `onProgress`.
- [x] 2.3 Extend `src/services/clientService/__tests__/clientService.test.ts` for multi-page searchAfter and sequential collect-all: result order unchanged, yield between pages, `onPageProgress` still fired.

## 3. Identity Fetch ingest

- [x] 3.1 Change `fetchIdentities` to ingest via search-after generator pages (fallback: `forEachChunked` on a collect-all array); skip protected identities; keep `identityIdsInScope` consistent with today.
- [x] 3.2 Call `setProgress(done, total, 'ingested')` during identity ingest; emit DETAIL `action=ingesting identities count=` when known count > 0; skip `ingested` progress when count is 0.
- [x] 3.3 Yield after each page and within a page when page size > 250.
- [x] 3.4 Extend identity-service tests: large ingest yields, protected skip, ingested progress, empty skip.

## 4. Fusion-account Fetch ingest

- [x] 4.1 Change `fetchFusionAccounts` to initialize/replace the map and `set` per generator page; no full-array `new Map(accounts.map)`.
- [x] 4.2 Yield after each page; `setProgress` unit `ingested`; DETAIL `action=ingesting fusion-accounts count=` when known count > 0; skip progress when empty.
- [x] 4.3 Extend source-service tests: per-page map registration, map replace, ingested progress; managed-account Fetch still uses unit `fetched`.

## 5. STATUS ingested unit

- [x] 5.1 Confirm heartbeat already renders `progress=done/total ingested`; add/adjust `operationHeartbeat.test.ts` for ingested unit, +delta, and fetched→ingested baseline reset (no new `INGEST` line kind).

## 6. Ubiquitous language

- [x] 6.1 Add **Bulk ingest** and **Ingested (progress unit)** to `openspec/specs/ubiquitous-language/spec.md` Canonical Terms (operations table) to match the delta spec.

## 7. Verification

- [x] 7.1 Confirm canonical test command: `npm test`
- [x] 7.2 Run targeted Vitest files for yield helper, clientService, identityService, sourceService, operationHeartbeat (do not pipe the suite to `tail`).
- [x] 7.3 All delta spec scenarios covered by named automated tests.

## 8. Documentation

- [x] 8.1 Update `docs/operations/account-list.md` Phase 2: bulk ingest yields; STATUS `ingested`; DETAIL `ingesting identities` / `ingesting fusion-accounts`.
- [x] 8.2 Update `docs/glossary.md` with **Bulk ingest** and **Ingested (progress unit)**; mention `ingested` next to other STATUS units if listed.
- [x] 8.3 Update `docs/reference/observability.md` STATUS progress units to include `ingested` (distinct from `fetched`).
- [x] 8.4 JSDoc on `forEachChunked` and ingest call sites.

## 9. Changelog

- [x] 9.1 Create or update changelog entry for this change via changelog-generator during apply.
- [x] 9.2 Confirm entry covers yielded bulk ingest and STATUS `progress=… ingested` (not a host timeout change).
