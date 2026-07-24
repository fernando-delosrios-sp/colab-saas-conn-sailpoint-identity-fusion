## Why

Fetch-phase aggregations spend most wall time in the shared `ApiQueue`, but today's defaults and throttle model under-use ISC's **100 requests per 10 second** API window. Steady 10 req/s spacing plus concurrency slots held during throttle sleep cap throughput below what ISC allows, especially for parallel account pagination across multiple sources. Timed-out requests also keep running at the HTTP layer, wasting sockets and queue capacity. Tuning this now improves Fetch duration without changing fusion or matching logic.

## What Changes

**Rate limiting model**
- From: Uniform `requestsPerSecond` spacing (`minRequestInterval`) before each request
- To: Sliding-window cap (default **80 requests / 10s**, max **100 / 10s**) aligned with ISC limits; legacy `requestsPerSecond` derives window cap when set alone
- Reason: ISC limits burst within a window, not steady spacing
- Impact: Non-breaking for operators at default 10 RPS equivalent; higher throughput when defaults/concurrency increase

**Concurrency vs throttle**
- From: `activeRequests++` before throttle sleep
- To: Rate limiter schedules starts; `activeRequests` counts in-flight HTTP only
- Reason: Restores effective parallelism for slow ISC responses
- Impact: Non-breaking behavior change; may increase short-term request starts within window cap

**Client timeout**
- From: Timer rejects promise; axios call continues
- To: `AbortSignal` cancels in-flight HTTP when `provisioningTimeout` fires
- Reason: Frees sockets and queue slots under timeout
- Impact: Non-breaking; failed requests fail faster and cleaner

**Default connection tuning**
- From: `maxConcurrentRequests: 10`, `parallelBatchSize: 8` (hidden), UI max concurrent **10**, RPS max **12**
- To: `maxConcurrentRequests: 20`, `parallelBatchSize: 12` (exposed in Advanced Connection Settings), UI max concurrent **30**, window max **100/10s**
- Reason: Better match ISC window + parallel pagination; operators can tune without code changes
- Impact: New installs get higher defaults; existing configs unchanged until operator adjusts

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `client-service`: Sliding-window rate limiting, decoupled concurrency counting, abort-on-timeout for queued HTTP calls

## Impact

- **Code:** `src/services/clientService/queue.ts`, `helpers.ts` or new rate-limit module, `clientService.ts`, `types.ts`, `src/data/config/settings/advancedConnectionSettings.ts`, `connector-spec.json`, `src/services/serviceRegistry.ts`
- **Tests:** `apiQueue.test.ts`, `clientService.test.ts`, config tests as needed
- **Docs:** `docs/guides/advanced-connection-settings.md` (ISC window, new defaults, parallel batch size)
- **Operations:** Faster Fetch on large tenants; monitor 429 rate after deploy; lower window cap if tenant is stricter than 100/10s
