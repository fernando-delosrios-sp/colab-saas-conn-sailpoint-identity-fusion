## 1. Consolidate retry condition

- [x] 1.1 Keep `shouldRetry(error)` as the canonical retry-condition function in `src/services/clientService/helpers.ts`.
- [x] 1.2 Remove the inline `retryCondition` from `createRetriesConfig`.
- [x] 1.3 Set `retryCondition: shouldRetry` in the returned `IAxiosRetryConfig`.

## 2. Consolidate retry delay calculation

- [x] 2.1 Keep `calculateRetryDelay(retryCount, error)` as the canonical delay calculator.
- [x] 2.2 Remove the inline `retryDelay` from `createRetriesConfig`.
- [x] 2.3 Set `retryDelay: calculateRetryDelay` in the returned config.
- [x] 2.4 Ensure `calculateRetryDelay` uses `BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1)` for exponential backoff.

## 3. Add robust `retry-after` parsing

- [x] 3.1 Add a private `parseRetryAfter(value: string, nowMs: number): number | undefined` helper.
- [x] 3.2 Accept pure non-negative integer strings and convert to milliseconds.
- [x] 3.3 Accept strict IMF-fixdate strings (`Day, DD Mon YYYY HH:MM:SS GMT`) via regex + `Date.parse`.
- [x] 3.4 Return `undefined` for anything else, including negative integers.
- [x] 3.5 In `calculateRetryDelay`, for 429 responses, use the parsed delay plus `RATE_LIMIT_JITTER_FACTOR` jitter; do not apply `MAX_RETRY_DELAY_MS`.

## 4. Update tests

- [x] 4.1 Add `expect(config.retryCondition).toBe(shouldRetry)`.
- [x] 4.2 Add `expect(config.retryDelay).toBe(calculateRetryDelay)`.
- [x] 4.3 Add tests for integer `retry-after` with jitter range (e.g. `5` → 5,000–5,500 ms).
- [x] 4.4 Add tests for HTTP-date `retry-after` with jitter range.
- [x] 4.5 Add tests for invalid `retry-after` values falling back to exponential backoff.
- [x] 4.6 Run `npm test` and `npm run lint`.

## 5. Validation

- [x] 5.1 Verify `ApiQueue` tests still pass (they mock `shouldRetry` and `calculateRetryDelay`).
- [x] 5.2 Verify no other callers of `createRetriesConfig` are affected.

## Additional fix (unrelated failing tests)

- [x] Fixed pre-existing TypeScript type mismatch in `src/services/attributeService/attributeService.ts` (`Account` vs `AccountV2025`) that was causing `accountCreate.test.ts`, `accountEnable.test.ts`, and `chain.replay.test.ts` to fail at compile time.
