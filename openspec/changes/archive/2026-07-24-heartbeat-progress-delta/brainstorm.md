# Brainstorm: heartbeat-progress-delta

## Background

The operation heartbeat STATUS line combines pipeline position (`progress=done/total`) with API queue throughput (`processed=N(Δ+…/interval)`). Operators tailing logs during long runs (especially Refresh and Output) see `progress` climbing while `(Δ+0/30s)` stays flat — because the delta measures **ApiQueue completions**, not pipeline items processed. During local CPU phases the queue is often idle (`active=0 queued=0`), so the line reads as stalled even when thousands of accounts are being processed per tick.

Fetch phase has a related gap: paginated ISC calls complete through the queue (queue delta moves) but there is no `setProgress` during Fetch, so STATUS shows phase=Fetch with no progress counter even though each page advances work. Pagination already knows page counts and (for offset APIs) `X-Total-Count`.

Prior art: `operation-status-heartbeat` (archived) intentionally put delta on queue `totalProcessed` for stall detection. That remains correct for API stalls but insufficient as the sole throughput signal.

## Q1: What delta should STATUS expose?

**Decision:** STATUS SHALL expose **two independent deltas** on each tick:
1. **Pipeline progress delta** — change in `OperationRunContext.progress.done` since the previous tick (enumerable work: fusion refresh batches, uncorrelated sweep, output send, fetch pages).
2. **API queue completed delta** — unchanged semantics (change in `QueueStats.totalProcessed`), used for stall detection.

Both use the same `(Δ±N/intervalSeconds)` suffix format and the configured heartbeat interval.

## Q2: How do we prevent confusing the two counters?

**Decision:** Rename the queue segment prefix from bare `queue` to **`api-queue`** and rename the counter from `processed=` to **`completed=`** (HTTP requests that finished through ApiQueue). Pipeline counter stays **`progress=done/total`** with its delta attached to that field.

Example target line:
```
STATUS phase=Refresh progress=7596/18495(Δ+2700/10s) elapsed=… api-queue active=0 queued=0 completed=635(Δ+0/10s) work-pending … mem …
```

When a progress **unit** is set (`processed`, `analyzed`, `sent`, `registered`, `fetched`), append it immediately after the fraction: `progress=450/800 analyzed(Δ+120/10s)`.

**Alternatives rejected:**
- Single combined delta — hides whether CPU or network is moving.
- Keep `processed=` for queue — collides mentally with pipeline “processed” unit.

## Q3: Which phases need new `setProgress` instrumentation?

**Decision:** Instrument all long-running enumerable phases:

| Phase | Call sites | Unit | Total source |
|-------|-----------|------|--------------|
| Fetch | managed-account pagination, fusion-account pagination, identity search pagination, form-instance pagination | `fetched` | `X-Total-Count` when available; else running count with `total=done` until complete |
| Refresh | existing `batchProcess` | `processed` | already wired |
| Process | uncorrelated sweep, record-unique registration | `analyzed`, `registered` | already wired |
| Output | `forEachISCAccount` | `sent` | already wired |

Fetch instrumentation prefers updating progress at **service layer batch boundaries** (after each page/batch lands in memory) rather than per HTTP request, to align heartbeat granularity with meaningful work units.

**Alternatives rejected:**
- Progress only on heartbeat-eligible phases — Fetch would remain blind.
- Per-request `setProgress` inside ApiQueue — couples queue to pipeline semantics.

## Q4: First-tick and reset behavior?

**Decision:** Omit delta suffix on the first STATUS tick after heartbeat start (same as queue today). Reset both previous progress and previous queue counters on heartbeat stop. If progress is cleared between phases, delta treats missing previous as undefined (no suffix) until the next tick establishes baseline.

## Q5: Stall detection impact?

**Decision:** Unchanged — stall detection continues to use **api-queue `completed` delta only**, not pipeline progress delta. A Refresh phase can show `progress Δ+N` with `api-queue completed Δ+0` without triggering WARN STALL when the queue is idle.

## Q6: Scope?

**Decision:** v1 scopes formatter + heartbeat tracking + Fetch progress wiring for account-list pipeline. Shared `OperationHeartbeat` / `formatStatusLine` infrastructure benefits other operations later but migration is out of scope.

**Out of scope:** Replacing per-page debug logs; structured host logging; changing heartbeat interval (already configurable, default 10s).

## Agreed approach

```
setProgress(done, total, unit?)  ← Fetch/Refresh/Process/Output
       ↓
OperationHeartbeat tick
  → progress=done/total [unit](Δ+pipelineDelta/interval)
  → api-queue … completed=N(Δ+queueDelta/interval)  // stall detection
```

## Trade-offs accepted

- STATUS lines grow slightly longer — acceptable for clarity.
- Log scrapers matching `queue processed=` must migrate to `api-queue completed=` — document in CHANGELOG.
- Fetch totals unknown until first response may show `progress=250/250 fetched(Δ+250/10s)` briefly before total updates — acceptable; total stabilizes after `X-Total-Count`.
