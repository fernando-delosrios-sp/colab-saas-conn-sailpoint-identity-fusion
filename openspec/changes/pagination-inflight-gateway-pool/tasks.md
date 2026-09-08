## 1. Constants and circuit state

- [x] 1.1 Replace internal client constants `consecutiveGatewayFailures`, `paginationCooldownMs`, and `maxCooldownsPerStream` with `inFlightGatewayFailureCap` (10) in `src/data/config/internal/clientService.ts`; keep `paginationGatewayMaxRetries` (1); remove cooldown wiring from `ClientService` / `FusionConfig`.
- [x] 1.2 Rewrite `PaginationCircuit` as a gateway-failure pool: enter on gateway failure, leave on that page’s success, threshold `min(inFlightGatewayFailureCap, window)`, shed without cooldown or probe (design D3–D5, D8).

## 2. Pagination circuit (tests first)

- [x] 2.1 Add failing tests in `src/services/clientService/__tests__/clientService.test.ts` for parallel window 12: 10 pool members shed and abort in-flight pages; unrelated `call()` continues; no 30s sleep; `PaginationError` with collected count and no silent partial success.
- [x] 2.2 Add failing tests: 9 pool members then one of those pages 200 → that page leaves the pool and the call continues; window 8 trips at 8.
- [x] 2.3 Add failing tests: sequential and searchAfter throw `PaginationError` on the first gateway failure with no cooldown; HTTP 429 does not enter the pool or shed; exhausted HTTP 500 throws `PaginationError` immediately; caller abort during paging fails without a cooldown wait.
- [x] 2.4 Keep tests: paginated 504 uses at most one retry (`paginationGatewayMaxRetries`); non-paginated 504 still uses configured `maxRetries` and does not shed other calls.
- [x] 2.5 Implement pool + slot hold + shed on sequential, parallel/`OffsetPageScheduler`, and searchAfter (design D1, D6, D7, D9 WARN with context, position, pool size, threshold). Remove cooldown/probe/resume-after-wait paths.

## 3. Verification

- [x] 3.1 Confirm canonical test command: `npm test` (do not pipe the suite to `tail`; redirect to a file if output is long).
- [x] 3.2 Run targeted Vitest: `src/services/clientService/__tests__/helpers.test.ts` and `src/services/clientService/__tests__/clientService.test.ts` (plus `apiQueue.test.ts` if retry-cap tests live there).
- [x] 3.3 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`).

## 4. Documentation

- [x] 4.1 Update `docs/use-guides/operation/tune-api-performance.md`: pool-then-shed at `min(10, window)`; no cooldown/probe; sequential/searchAfter fail on first gateway failure; OFFSET paging unchanged.
- [x] 4.2 Update `docs/glossary.md`: add **Gateway-failure pool**; redefine **Pagination circuit**; remove **Cooldown** and **Probe** as current circuit terms.
- [x] 4.3 JSDoc on pool helpers; no new connector-spec help text (v1 has no spec knobs).

## 5. Changelog

- [x] 5.1 Create or update changelog entry for this change via changelog-generator during apply.
- [x] 5.2 Confirm entry covers pagination-stream gateway-failure pool abort (no 30s wait, no probe) and that paginated 504 retry cap / non-paginated retries are unchanged — not OFFSET replacement and not a global queue kill switch.
