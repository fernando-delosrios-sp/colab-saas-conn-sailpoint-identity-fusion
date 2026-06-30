## Why

`src/services/clientService/helpers.ts` currently maintains two parallel copies of the same retry policy: one inline inside `createRetriesConfig` for axios-retry, and another in the exported `shouldRetry` / `calculateRetryDelay` functions used by `ApiQueue`. The copies have already drifted (different exponential exponent, missing retry-after jitter in the axios path), which makes the connector's retry behavior inconsistent and harder to maintain.

## What Changes

- Extract `shouldRetry` as the single retry-condition function and wire `createRetriesConfig.retryCondition` to it.
- Extract `calculateRetryDelay` as the single delay-calculator function and wire `createRetriesConfig.retryDelay` to it.
- Unify the exponential backoff exponent to `BASE_RETRY_DELAY_MS * 2^(retryCount - 1)` for both paths.
- Add jitter to `retry-after` handling in the axios path by reusing `calculateRetryDelay`.
- Add a strict `parseRetryAfter` helper that accepts integer seconds or IMF-fixdate HTTP-date strings, falling back to exponential backoff for anything else.
- Leave `retry-after` delays uncapped to respect the server's explicit instruction.
- Add tests that lock in the consolidation (reference equality and jitter ranges).

## Capabilities

### New Capabilities
- (None)

### Modified Capabilities
- `client-service-retry`: Unified retry condition and delay calculation across axios-retry and `ApiQueue` paths, with consistent exponential backoff and jittered `retry-after` support.

## Impact

- **Affected code:** `src/services/clientService/helpers.ts`, `src/services/clientService/__tests__/helpers.test.ts`
- **Impact:** Non-queue deployments will see the first retry delay change from ~2 s to ~1 s (standard exponential backoff). Queue deployments are unaffected except that `retry-after` values are now parsed more robustly.
