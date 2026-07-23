# HTTP Agent Socket Pool Tuning Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden HTTPS connection pooling in `SdkApiAdapter` with explicit socket pool limits.

**Architecture:** Single constructor change in `sdkApiAdapter.ts`. Replace `new https.Agent({ keepAlive: true })` with an agent configured with `keepAliveMsecs`, `maxSockets`, `maxFreeSockets`, and `timeout`. The shared agent continues to flow through `Configuration.baseOptions.httpsAgent` to all SDK API instances. No queue, retry, or config changes.

**Tech Stack:** TypeScript, Node.js, Vitest

**Change artifacts:** `openspec/changes/http-agent-socket-pool-tuning/` (proposal, design, specs, tasks)

---

## Task 1: Configure bounded HTTPS agent

**Files:**
- Modify: `src/services/clientService/sdkApiAdapter.ts`

- [ ] **Step 1:** Open `SdkApiAdapter` constructor (~line 40)
- [ ] **Step 2:** Replace:
  ```typescript
  // Inject https agent with keepAlive: true to reuse TCP connections
  const agent = new https.Agent({ keepAlive: true })
  ```
  With:
  ```typescript
  // Inject https agent with keepAlive and connection pool bounds
  const agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
  })
  ```
- [ ] **Step 3:** Confirm `Configuration` wiring unchanged:
  ```typescript
  this.config = new Configuration({ ...fusionConfig, tokenUrl, baseOptions: { httpsAgent: agent } } as any)
  ```
- [ ] **Step 4:** Run `npx tsc --noEmit`

---

## Task 2: Client service regression tests

**Files:**
- Test: `src/services/clientService/__tests__/clientService.test.ts`

- [ ] **Step 1:** Run client service tests:
  ```bash
  npm test -- src/services/clientService/__tests__/clientService.test.ts
  ```
- [ ] **Step 2:** Verify no connection or network errors in test output

---

## Task 3: Full verification

- [ ] **Step 1:** Run full suite: `npm test`
- [ ] **Step 2:** Run lint: `npm run lint`
- [ ] **Step 3:** Grep `sdkApiAdapter.ts` — confirm agent includes all four pool options

---

## Reference: Current vs target

| Aspect | Current | Target |
|--------|---------|--------|
| `keepAlive` | `true` | `true` (unchanged) |
| `keepAliveMsecs` | default | `30000` |
| `maxSockets` | default (unlimited) | `50` |
| `maxFreeSockets` | default | `10` |
| `timeout` | default | `60000` |
| Agent sharing | single via `baseOptions.httpsAgent` | unchanged |
| ApiQueue / retries | unchanged | unchanged |
| Files touched | — | `sdkApiAdapter.ts` only |

## Out of scope

- `createRetriesConfig` / axios retry settings
- `ApiQueue` concurrency or priority
- Connector configuration settings for pool limits
- Load testing or FD monitoring
