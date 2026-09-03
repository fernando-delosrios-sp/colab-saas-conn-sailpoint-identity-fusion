## Context

All ISC HTTP goes through `ClientService.call()` → `ApiQueue`. Fetch loads accounts via `SourceService.fetchAccountsBySourceIdGenerator` with `paginate: { mode: 'parallel' }`: first page uses `count: true`, then a sliding window (default `parallelBatchSize` up to 16) requests rising `offset` values. `shouldRetry` treats 504 as 5xx. Default `maxRetries` is 20 with exponential backoff capped at 60s. After a page succeeds or exhausts retries, the window schedules higher offsets.

A P1 showed that pattern against a large source: skip-scan cost grew with offset, ISC returned 504, the connector retried and continued paging. Stakeholders asked for a consecutive-failure circuit. Discovery locked **cooldown then abort** on the **pagination stream only**, not a global queue kill switch, and not OFFSET replacement.

```
closed --gateway streak--> shedding --in-flight aborted--> cooldown --wait--> probe
  ^                                                              |          |
  +--------------------- probe 200, restore window --------------+          |
                                                                            v
                                                              PaginationError (open)
```

## Goals / Non-Goals

**Goals:**

- After consecutive gateway failures on one paginated call, shed that stream, cooldown once, probe once
- Abort the call with `PaginationError` if the probe fails or a second streak occurs
- Cap per-page gateway-failure retries so the circuit sees the streak
- Leave non-paginated queue traffic and 429 handling unchanged
- Keep silent partial success forbidden

**Non-Goals:**

- Replacing OFFSET or parallel `listAccounts` with keyset / id-range workers
- Adaptive `parallelBatchSize` on rising latency while pages still return 200
- Tenant-wide or `ApiQueue`-wide circuit
- New Advanced Connection Settings fields (v1 uses internal constants)
- Changing provisioning timeout or keep-alive intervals

## Decisions

### D1: Circuit lives on the pagination stream, not ApiQueue

- **Choice:** Each paginated `call()` (sequential, parallel, searchAfter) owns a small circuit state machine. Unrelated `call()` items keep running.
- **Reason:** A 504 on account paging must not block form/patch traffic.
- **Considered alternatives:** Queue-wide breaker — rejected (wrong blast radius); SourceService-only — rejected (same helper serves all list pagination).

### D2: Gateway failure definition

- **Choice:** HTTP **504** or request timeout (`ECONNABORTED`, `ETIMEDOUT`). Not 429. Not other 5xx (those keep existing retries and immediate `PaginationError` on exhaustion).
- **Reason:** Matches the P1; 429 already has Retry-After; a 500 is not “gateway gave up on a skip-scan.”
- **Considered alternatives:** All 5xx — rejected (collapses distinct recovery paths).

### D3: Consecutive streak and parallel windows

- **Choice:** Count **completed page outcomes** on the stream. A successful page resets the streak to 0. Threshold **3** gateway failures with no intervening 200. Parallel 504s count as they complete (three sibling 504s trip without waiting for sequential time).
- **Reason:** “Consecutive HTTP requests failed” in a window is a burst, not a single-file sequence.
- **Considered alternatives:** Trip on first 504 — rejected (no cooldown chance); require 3 in series on the same offset — rejected (window would keep firing other offsets).

### D4: Shed includes aborting in-flight page HTTP

- **Choice:** When the circuit opens to cooldown, stop scheduling new offsets/cursors and abort in-flight page executions for **this stream** (merged abort signal). Do not abort other queue items.
- **Reason:** 504 often leaves the DB query running; retrying or leaving siblings in flight stacks skip-scans.
- **Considered alternatives:** Pause scheduling only — rejected (in-flight high offsets keep burning ISC).

### D5: One cooldown, then probe, then abort

- **Choice:** Cooldown **30s** (capped wait; abortable via caller `abortSignal`). Then one **probe**: the lowest not-yet-successfully-yielded page (same offset or same searchAfter cursor), window = 1. Probe 200 → closed, restore configured window/cadence. Probe gateway failure → `PaginationError`. A later streak after resume → `PaginationError` with **no second cooldown**. Caller abort or provisioning timeout during cooldown → fail without probing.
- **Reason:** One chance for congestion; no hang until command expiry; no slow-motion P1.
- **Considered alternatives:** Abort-first — rejected (no recovery); unbounded cooldowns — rejected; cooldown without probe (always abort after wait) — rejected (wait would be theater).

### D6: Gateway-failure retry cap on paginated pages

- **Choice:** For page `execute()` inside pagination, gateway failures use **`maxRetries` 1** (one extra attempt) instead of config `maxRetries` (default 20). Other retryable errors on those pages keep the configured budget. Non-paginated calls unchanged.
- **Reason:** Twenty 60s backoffs on the same OFFSET hide the circuit and amplify the P1.
- **Considered alternatives:** `noRetry` on 504 — acceptable but one retry covers a single blip; keep 20 — rejected.

### D7: Constants, not connector-spec (v1)

- **Choice:** `consecutiveGatewayFailures = 3`, `paginationCooldownMs = 30_000`, `paginationGatewayMaxRetries = 1`, `maxCooldownsPerStream = 1` in internal client config.
- **Reason:** Discovery deferred knobs until apply-time evidence.
- **Considered alternatives:** Expose in Advanced Connection Settings now — deferred.

### D8: Observability

- **Choice:** WARN when shedding, when cooldown starts (duration), when probe starts, and when aborting after failed probe / second streak. Include pagination `context` and offset/cursor. Do not add a new STATUS grep prefix; existing `PaginationError` still fails the operation.
- **Reason:** Operators need to distinguish circuit abort from a single page retry.
- **Considered alternatives:** STATUS `api=` flag — deferred (heartbeat already shows active/queue).

## Risks / Trade-offs

- [Risk] Cooldown 30s + probe still 504s on a skip that cannot finish inside the gateway timeout → Mitigation: abort after one probe; OFFSET replacement remains a follow-up change
- [Risk] Threshold 3 is too high during a 16-wide window (brief extra load) → Mitigation: shed aborts the rest of the window as soon as 3 complete; tune constant in apply if needed
- [Risk] Aborting in-flight pages races with yield reorder buffer → Mitigation: treat aborted siblings as non-success; throw `PaginationError` after failed probe using items already yielded/collected only
- [Risk] Tests hang on real 30s cooldown → Mitigation: inject clock / cooldown ms in tests
- [Trade-off] Fetch fails instead of eventually completing a huge OFFSET scan → Reason for acceptance: completing that scan is what caused the P1
- [Trade-off] Successful high-offset pages still stress ISC → Reason for acceptance: explicit non-goal; circuit is failure-path only

## Migration Plan

Ship in a connector release. No tenant schema or ISC API change. Rollback is revert of the client pagination circuit (previous retry-until-exhaustion behavior). Operators should watch WARN lines and failed Fetch on large sources after upgrade.

Acceptance: unit tests for sequential, parallel, and searchAfter covering streak → shed → cooldown → probe 200 resume; probe 504 abort; second streak abort without cooldown; 429 not tripping; non-paginated 504 still uses configured `maxRetries`.

## Open Questions

None blocking. Constants may move to connector-spec later if operations need them.
