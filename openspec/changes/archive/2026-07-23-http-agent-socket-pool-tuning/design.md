## Context

The client service routes all outbound ISC HTTP calls through `ClientService.call()` and a shared `ApiQueue`. The production SDK path uses `SdkApiAdapter`, which constructs a SailPoint SDK `Configuration` with a custom `https.Agent` for TCP connection reuse:

```typescript
const agent = new https.Agent({ keepAlive: true })
this.config = new Configuration({ ...fusionConfig, tokenUrl, baseOptions: { httpsAgent: agent } })
```

Keep-alive is enabled but pool sizing uses Node.js defaults (`maxSockets` effectively unlimited per host). The queue serializes and retries at the application layer; the agent owns the underlying socket lifecycle.

## Goals / Non-Goals

**Goals:**
- Configure explicit `maxSockets`, `maxFreeSockets`, `keepAliveMsecs`, and `timeout` on the shared `https.Agent`
- Preserve keep-alive connection reuse and existing SDK/queue behavior
- Pass all existing client service tests without modification

**Non-Goals:**
- Changing `createRetriesConfig` or axios retry settings
- Modifying `ApiQueue` concurrency, priority, or retry logic
- Exposing pool limits as connector configuration
- Separate agents per SDK API instance
- Load testing or file-descriptor monitoring

## Decisions

### D1: Explicit pool limits vs defaults

- **Choice:** Set `maxSockets: 50`, `maxFreeSockets: 10`, `keepAliveMsecs: 30000`, `timeout: 60000`
- **Reason:** Advisor-validated conservative bounds; caps per-host concurrency while retaining a warm idle pool
- **Considered alternatives:** Defaults only — rejected (unbounded socket growth under burst); configurable settings — rejected (YAGNI)

### D2: Single shared agent vs per-API agents

- **Choice:** Keep one agent injected into `Configuration.baseOptions.httpsAgent`
- **Reason:** All SDK APIs target the same ISC host; one pool is correct and avoids multiplied idle sockets
- **Considered alternatives:** Per-API agents — rejected (unnecessary overhead)

### D3: Spec delta scope

- **Choice:** ADDED requirement documenting HTTPS agent pool bounds in `client-service`
- **Reason:** Pool configuration is a testable transport contract; prevents future regressions to bare `{ keepAlive: true }`
- **Considered alternatives:** No spec change — rejected; client-service owns SDK adapter wiring

## Risks / Trade-offs

- [Risk] `maxSockets: 50` queues requests at the transport layer under extreme burst → Mitigation: `ApiQueue` already bounds application concurrency; 50 provides generous headroom above typical queue depth
- [Risk] Idle socket timeout closes connections mid-long-poll → Mitigation: 60s timeout aligns with queue retry windows; ISC REST calls are request/response
- [Trade-off] Fixed constants, not operator-configurable → Accepted: internal tuning; avoids config surface creep

## Migration Plan

N/A — internal transport hardening. Deploy via normal connector bundle update. No data migration, config changes, or operator action required.

**Rollback:** Revert agent constructor to `{ keepAlive: true }`.

## Open Questions

- None blocking implementation.
