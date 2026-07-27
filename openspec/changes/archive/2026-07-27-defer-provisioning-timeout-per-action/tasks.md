## 1. ClientService deferred timeout

- [x] 1.1 Move `AbortController` + `setTimeout` from outer `ClientService.execute()` into the lazy `fn()` closure invoked by the queue (merge timeout with caller `abortSignal` inside `fn()` only)
- [x] 1.2 Pass only caller `abortSignal` to `queue.enqueue()` — do not pass merged timeout signal at enqueue time
- [x] 1.3 Ensure `timeoutId` is cleared in `fn()` finally block after each execution attempt
- [x] 1.4 Add test: item queued longer than `provisioningTimeout` succeeds when HTTP is fast once execution starts
- [x] 1.5 Add test: slow HTTP after execution start rejects with timeout message
- [x] 1.6 Add test: retry after retryable failure gets fresh timeout budget on second attempt

## 2. ApiQueue abort reason and rate-limit wait counter

- [x] 2.1 Update queue abort handlers (pre-flight, while-queued, post-wait) to reject with `signal.reason ?? new Error('Aborted')`
- [x] 2.2 Add `rateLimitWaitCount` to `QueueStats` in `types.ts`; increment/decrement in `executeRequest` around `waitForSlot()`; reset in `clear()`
- [x] 2.3 Add apiQueue tests for abort reason propagation and `rateLimitWaitCount` lifecycle
- [x] 2.4 Update `ClientService.getQueueStats()` fallback object to include `rateLimitWaitCount: 0`

## 3. STATUS heartbeat combined q

- [x] 3.1 Update `formatApiQueueSegment` to use `queueLength + (rateLimitWaitCount ?? 0)` for `q`
- [x] 3.2 Update `isApiQueueIdle` and stall detection to treat combined pending count as non-idle
- [x] 3.3 Add operationHeartbeat tests for combined `q` when FIFO is empty but rate-limit wait > 0

## 4. Documentation

- [x] 4.1 Update `docs/guides/advanced-connection-settings.md` — clarify provisioning timeout applies to in-flight HTTP per attempt, not queue wait
- [x] 4.2 Document STATUS `q` includes rate-limiter wait in api segment description

## 5. Verification

- [x] 5.1 Run targeted tests: `apiQueue.test.ts`, `clientService.test.ts`, `operationHeartbeat.test.ts`
- [x] 5.2 Run `npm run lint`
