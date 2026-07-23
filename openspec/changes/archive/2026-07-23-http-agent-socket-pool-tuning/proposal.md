## Why

`SdkApiAdapter` enables HTTP keep-alive on the shared `https.Agent` but leaves socket pool limits at Node.js defaults. Under high-concurrency burst workloads — paginated aggregation, parallel search pages, multi-source fusion runs — unmanaged connection creation can exhaust file descriptors or accumulate idle sockets. The `ApiQueue` throttles application-level concurrency; explicit transport-layer pool bounds complement that protection without changing caller behavior.

## What Changes

**HTTPS agent initialization in `SdkApiAdapter`**
- From: `new https.Agent({ keepAlive: true })`
- To: Agent with explicit `keepAliveMsecs: 30000`, `maxSockets: 50`, `maxFreeSockets: 10`, `timeout: 60000`
- Reason: Bound concurrent and idle socket counts per ISC host
- Impact: Non-breaking; internal transport tuning only

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `client-service`: Document HTTPS agent pool bounds for the SDK adapter

## Impact

- **Code:** `src/services/clientService/sdkApiAdapter.ts` (agent constructor only)
- **Tests:** Existing `clientService.test.ts` must pass unchanged
- **Operations:** Reduced FD pressure under burst; no config or deployment changes
- **Dependencies:** None
