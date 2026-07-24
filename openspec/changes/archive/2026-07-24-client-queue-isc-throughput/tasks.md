## 1. Sliding-window rate limiter

- [x] 1.1 Add `SlidingWindowRateLimiter` (e.g. `src/services/clientService/rateLimiter.ts`) with `tryAcquire()` / `waitForSlot()` and unit tests for 80/10s cap and sliding eviction
- [x] 1.2 Extend `QueueConfig` / `types.ts` with `rateLimitWindowMs` and `rateLimitMaxRequests`; wire defaults in `internal/clientService.ts` (10000ms, 80 max, 100 hard cap)
- [x] 1.3 Map legacy `requestsPerSecond` to window max in `ServiceRegistry` or config read when explicit window max unset
- [x] 1.4 Replace `nextRequestTime` / `minRequestInterval` throttle in `queue.ts` with sliding-window gate before HTTP start

## 2. Decouple concurrency from rate wait

- [x] 2.1 Refactor `executeRequest` so rate-limit wait happens before `activeRequests++`
- [x] 2.2 Add/adjust `apiQueue.test.ts` cases: slow in-flight requests + rate wait does not inflate `activeRequests`; concurrency cap still enforced under load

## 3. Abort on client timeout

- [x] 3.1 In `ClientService.execute()`, create merged `AbortSignal` (caller + timeout) when `requestTimeoutMs` set
- [x] 3.2 Pass signal through `queue.enqueue()`; reject early if already aborted
- [x] 3.3 Ensure axios/SDK request receives abort signal (adapter or execute wrapper); add test with intentionally slow mock that verifies cancellation

## 4. Default tuning and connector-spec

- [x] 4.1 Update `advancedConnectionSettings.ts` defaults: `maxConcurrentRequests: 20`, `parallelBatchSize: 12`
- [x] 4.2 Update `connector-spec.json` initial values and field ranges: `maxConcurrentRequests` max 30; add `parallelBatchSize` (default 12, range 1–16); document ISC 100/10s in help text for rate fields
- [x] 4.3 Sync `connector-spec` initial values script if required by build pipeline
- [x] 4.4 Update `docs/guides/advanced-connection-settings.md`: ISC window model, new defaults, parallel batch size field, tuning guidance (lower window on 429)

## 5. Verification

- [x] 5.1 Run `npm test -- src/services/clientService/__tests__/`
- [x] 5.2 Run `npm test`
- [x] 5.3 Run `npm run lint`
