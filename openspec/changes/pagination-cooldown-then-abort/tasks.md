## 1. Constants and gateway-failure classification

- [x] 1.1 Add internal client constants: `consecutiveGatewayFailures` (3), `paginationCooldownMs` (30_000), `paginationGatewayMaxRetries` (1), `maxCooldownsPerStream` (1) in `src/data/config/internal/clientService.ts` and wire through `InternalConfig` / `FusionConfig` as needed (not connector-spec).
- [x] 1.2 Add `isGatewayFailure(error)` (HTTP 504, `ECONNABORTED`, `ETIMEDOUT`; not 429; not other 5xx) next to `shouldRetry` with unit tests in `src/services/clientService/__tests__/helpers.test.ts`.

## 2. Pagination circuit (tests first)

- [x] 2.1 Add failing tests in `src/services/clientService/__tests__/clientService.test.ts` for parallel: three sibling 504 completions shed and abort in-flight pages on that stream; unrelated `call()` continues; cooldown is injectable (do not sleep 30s in CI); successful probe resumes the configured window.
- [x] 2.2 Add failing tests: probe 504 throws `PaginationError` with collected count and no silent partial success; no second cooldown; second streak after resume throws without cooldown.
- [x] 2.3 Add failing tests: sequential and searchAfter use the same circuit (probe retries same offset / same searchAfter cursor); HTTP 429 does not shed; exhausted HTTP 500 throws `PaginationError` without cooldown; caller abort during cooldown does not send a probe.
- [x] 2.4 Add failing tests: paginated 504 uses at most one retry (`paginationGatewayMaxRetries`); non-paginated 504 still uses configured `maxRetries`.
- [x] 2.5 Implement per-stream pagination circuit in `ClientService` pagination paths (`sequential`, `parallel`/`OffsetPageScheduler`, `searchAfter`): streak on completed page outcomes, shed + abort stream page HTTP, one cooldown, one probe, restore window on probe success, `PaginationError` on failed probe or second streak (design D1–D6, D8 WARN logs with context and offset/cursor).

## 3. Ubiquitous language

- [x] 3.1 Add **Gateway failure**, **Pagination circuit**, **Cooldown**, and **Probe** to `openspec/specs/ubiquitous-language/spec.md` Canonical Terms (and matching ADDED requirement) so archive merge is a no-op conflict.

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (do not pipe the suite to `tail`; redirect to a file if output is long).
- [x] 4.2 Run targeted Vitest: `src/services/clientService/__tests__/helpers.test.ts` and `src/services/clientService/__tests__/clientService.test.ts` (plus `apiQueue.test.ts` if retry-cap tests live there).
- [x] 4.3 All delta spec scenarios covered by named automated tests.

## 5. Documentation

- [x] 5.1 Update `docs/use-guides/operation/tune-api-performance.md`: pagination circuit vs API request retries; 504/timeout shed-cooldown-probe-abort; OFFSET paging unchanged.
- [x] 5.2 Update `docs/concepts/glossary.md` (and `docs/glossary.md` if it still mirrors terms) with the four new terms.
- [x] 5.3 JSDoc on circuit helpers and `isGatewayFailure`; no new connector-spec help text (v1 has no spec knobs).

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via changelog-generator during apply.
- [x] 6.2 Confirm entry covers pagination-stream cooldown-then-abort on 504/timeout and the paginated 504 retry cap — not OFFSET replacement and not a global queue kill switch.
