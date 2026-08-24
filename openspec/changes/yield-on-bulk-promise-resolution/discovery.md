## Scope

In: after a large paginated `client.call` (or equivalent collect-all promise) resolves, register results into FusionRun/service maps in chunks that yield to the Node event loop, and report pipeline progress on the **STATUS line** the same way Fetch reports `fetched`. Out: raising the ISC/Cambridge 5-minute `std:account:list` command ceiling, streaming Output before Process, aggregation batch-size as the primary fix, and rewriting HTTP pagination itself except where a collect-all helper must yield between pages.

## Language

**Bulk ingest** (`draft` → `promote`):
The CPU-bound stretch after a collect-all fetch promise resolves, when pages already in memory are written into run caches (identity map, fusion-account map, managed-account map). Distinct from HTTP Fetch, which is I/O-bound page retrieval.
_Avoid_: “promise dump”, “hydration” (already used for missing-identity API follow-up), “flush”

**Ingested (progress unit)** (`draft` → `promote`):
The `OperationRunContext.progress.unit` value used while bulk ingest is running, rendered on the STATUS line as `progress=done/total ingested` (same shape as Fetch’s `fetched` and Process’s `analyzed`).
_Avoid_: reusing `fetched` for post-HTTP cache registration (operators cannot tell HTTP vs ingest); ad-hoc INFO prose that is not STATUS-progress

**Operation heartbeat** (canonical — reuse):
Periodic STATUS / EVENT_SUMMARY emission. Keep-alive and STATUS both run on the same event loop; bulk ingest MUST yield so both can fire.
_Avoid_: treating STATUS as a substitute for `res.keepAlive()`

**STATUS line** (canonical — reuse):
Host-visible situational line including `progress=done/total {unit}`. Bulk ingest SHALL drive this via `log.setProgress`, not a new line kind.
_Avoid_: a new `INGEST` grep prefix

**Fetch** (canonical operation phase — reuse):
Account-list phase 2. Bulk ingest of identities, fusion accounts, and remaining collect-all results happens inside Fetch after (or interleaved with) HTTP, still `phase=Fetch`.
_Avoid_: inventing a sixth account-list phase for ingest

## Decisions

Context: A first-time ~102k managed-account Fetch completed HTTP (`Source sailpoint-Jackdaw: collected 102407`) then went silent for ~2.5 minutes. STATUS and keep-alive (`keep_alive_count=2` over 300s) stopped because the event loop was blocked. The command then expired (`command expired`, `output_count=0`). Root cause: collect-all promises (`paginateSearchAfter` → `Promise<T[]>`, fusion accounts `accounts.push(...batch)` then `new Map(accounts.map(...))`, identity `for` over the full array) run a synchronous continuation on resolution.

Q1: Stream pages into caches (generator) vs chunk the resolved array?
Chosen: **both, with a shared chunk+yield helper as the contract**. Identity Fetch already has `paginateSearchApiGenerator` / `fetchIdentitiesGenerator` unused by `fetchIdentities`. Prefer page-at-a-time ingest where a generator already exists. Where a collect-all API remains, chunk the array with `yieldToEventLoop` (existing util; Process already yields on managed-account drain). Do not invent a second yield primitive.

Q2: How should operators see ingest progress?
Chosen: **`log.setProgress(done, total, 'ingested')`** so the existing heartbeat renders `progress=N/M ingested(Δ+…/10s)` exactly like Fetch’s `fetched`. Emit a DETAIL start (`action=ingesting … count=`) when ingest begins if total is known; do not add a parallel INFO spam loop (heartbeat already ticks every `heartbeatInterval`).

Q3: Does this remove the 5-minute command expiry?
Chosen: **No.** Yielding restores STATUS/keep-alive during ingest; wall-clock Fetch+Process+Output for 102k on first run can still exceed 5 minutes. Aggregation batch size remains the operational mitigation for the host timeout.

Q4: Shared helper location?
Chosen: extend `src/utils/yieldToEventLoop.ts` (or a sibling in `utils/`) with `forEachChunked` / `ingestChunked` that yields every N items and optionally reports progress. Call it from identity Fetch, fusion-account Fetch, and any remaining collect-all pagination concat loop. Reuse Process yield interval scale (on the order of managed-account `yieldEvery`, cap ~25–250 items) — exact N in design.

## Open questions

None blocking. Chunk size N is a design constant (not a new connector-spec setting) unless implementation shows a need to reuse `managedAccountsBatchSize`.

## Scenarios discussed

- Identity `searchAfter` collect-all resolves with tens of thousands of documents, then `run.addIdentity` in a tight loop — must yield and show `ingested` progress.
- Fusion accounts collected via generator into a giant array then `new Map(...)` — ingest per page or chunked Map writes with progress.
- Managed accounts already ingest per HTTP page via `setManagedAccount`; after last page, no extra giant continuation — no behavior change required unless a leftover concat exists.
- Parallel Fetch tasks (`Promise.all` of identities, managed, fusion, forms) overwrite a single `setProgress` slot today (`fetched`). Ingest SHALL set unit to `ingested` so STATUS unit change resets the heartbeat baseline (existing `resetProgressBaselineIfContextChanged`).
- Empty result: skip ingest progress (no STATUS unit flicker).
- Small N (below chunk size): one pass, optional single yield at end, progress  N/N once.
- Yielding MUST allow `setInterval` keep-alive and OperationHeartbeat ticks to run between chunks; tests can fake timers / mock `setImmediate`.
