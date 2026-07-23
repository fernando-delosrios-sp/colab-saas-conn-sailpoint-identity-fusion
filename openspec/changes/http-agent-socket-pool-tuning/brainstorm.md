# Brainstorm: HTTP Keep-Alive & Socket Pool Hardening

**Source:** Advisor plan 005 (`advisor-plans/005-http-agent-socket-pool-tuning.md`)  
**Written against commit:** `3a8b4ac`

## Background

`SdkApiAdapter` in `src/services/clientService/sdkApiAdapter.ts` injects a shared Node.js `https.Agent` into the SailPoint SDK `Configuration` so outbound ISC API calls reuse TCP connections via HTTP keep-alive. Current initialization:

```typescript
const agent = new https.Agent({ keepAlive: true })
```

The agent enables keep-alive but leaves socket pool limits at Node.js defaults (`maxSockets` unlimited per host, default `maxFreeSockets`, default idle behavior). Under high-concurrency bursts — paginated account aggregation, parallel search pages, multi-source fusion runs — unmanaged connection creation can exhaust file descriptors or accumulate idle sockets.

The `ApiQueue` already serializes and throttles outbound requests at the application layer; this change hardens the transport layer beneath it.

## Decision Chain

### Q1: What problem are we solving?

Unbounded or poorly bounded HTTPS socket pools under burst workloads. Medium leverage, no dependencies, no config surface changes. Behavior must remain functionally identical for callers — only connection lifecycle bounds change.

### Q2: What approaches were considered?

**A. Explicit pool limits on the existing shared agent (recommended)**

Configure `maxSockets`, `maxFreeSockets`, `keepAliveMsecs`, and `timeout` on the single `https.Agent` in `SdkApiAdapter`:

```typescript
const agent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
})
```

- Bounds concurrent sockets per host without changing the public API
- Aligns with advisor plan values tuned for connector burst patterns
- One-line constructor change; no new abstractions

**B. Separate agents per SDK API instance**

Give each lazy-loaded API getter its own agent.
- Rejected: Multiplies pool overhead; all APIs share the same ISC host — one agent is correct

**C. Expose pool limits as connector configuration**

Add fusion config settings for `maxSockets`, etc.
- Rejected: YAGNI — internal transport tuning, not operator-facing; defaults are sufficient

**D. Disable keep-alive entirely**

Use default agent without connection reuse.
- Rejected: Regresses throughput and increases TLS handshake overhead on every request

### Q3: Are the chosen values safe for this connector?

Yes, as conservative defaults:

| Option | Value | Rationale |
|--------|-------|-----------|
| `maxSockets` | 50 | Caps per-host concurrent connections; well above typical queue concurrency but below FD exhaustion risk |
| `maxFreeSockets` | 10 | Retains a warm pool without hoarding idle sockets |
| `keepAliveMsecs` | 30000 | Standard 30s TCP keep-alive probe interval |
| `timeout` | 60000 | Socket inactivity timeout before destroy |

The `ApiQueue` remains the sole retry authority (axios retries disabled via `createRetriesConfig(0)`). Pool limits complement queue throttling, not replace it.

### Q4: What stays out of scope?

- `createRetriesConfig` / axios retry behavior
- `ApiQueue` concurrency, priority, or retry logic
- HTTP vs HTTPS agent split (ISC API is HTTPS-only in production)
- Operator-configurable pool settings
- Load testing or FD monitoring instrumentation

## Agreed Approach

Replace bare `{ keepAlive: true }` with explicit pool bounds in `SdkApiAdapter` constructor. No API, config, or queue changes.

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Fixed constants vs configurable | Fixed constants — internal tuning, not operator concern |
| `maxSockets: 50` may queue at transport layer under extreme burst | `ApiQueue` already bounds application concurrency; 50 is generous headroom |
| No unit test asserting agent options | Existing client service tests verify adapter wiring; agent options are constructor config |
| Spec documents pool bounds as requirement | Testable contract for future regressions |

## Done Criteria (from advisor plan)

- `https.Agent` includes explicit `maxSockets`, `maxFreeSockets`, `keepAliveMsecs`, and `timeout`
- Client service tests pass without network or connection errors
