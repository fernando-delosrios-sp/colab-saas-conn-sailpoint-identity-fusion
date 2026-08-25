## Context

Account-list Fetch runs identities, managed accounts, Fusion accounts, and forms in `Promise.all`. Each writer currently calls `log.setProgress`, which overwrites a single `OperationRunContext.progress`. Heartbeat STATUS therefore shows whichever task wrote last (`fetched` vs `ingested`, different totals). Operators chose proposal B: independent who-axis counters, no HTTP-vs-ingest stage on STATUS.

## Goals / Non-Goals

**Goals:**
- One Fetch STATUS line can show Fusion, managed, and (when running) identity load at once.
- Per-segment interval deltas without last-writer unit flipping.
- Refresh/Process/Output keep the existing `progress=` slot.

**Non-Goals:**
- Per-source managed STATUS tokens (queue-pending stays).
- `fetched`/`ingested` as Fetch STATUS units.
- Forms/workflow as population counters.
- Changing bulk-ingest yielding or DETAIL `ingesting …` lines.
- Raising the host command timeout.

## Decisions

### D1: Dedicated Fetch population API, not overloaded `setProgress`

- **Choice**: `LogService` / `OperationRunContext` hold a bag of Fetch counters. Callers use `setFetchPopulationProgress(population, done, total)` (name at implementer discretion). `setProgress` remains for Refresh/Process/Output.
- **Reason**: `setProgress` is last-writer-wins; Fetch writers must not share it.
- **Considered alternatives**: Keep `setProgress` with a synthetic unit per population (still one slot). Parallel STATUS lines (noise, grep harder).

### D2: STATUS token shape

- **Choice**: `fusion-accounts={done}/{total}`, `managed-accounts={done}/{total}`, `identities={done}/{total}` on the existing STATUS line (same `Δ` suffix shape as today, per segment). Stable order: fusion, managed, identities. Omit a segment until that population has a known total or `done > 0`. Omit identities entirely when identity Fetch is skipped.
- **Reason**: Matches the operator example; grep-friendly; no new line kind.
- **Considered alternatives**: `identities=skipped`; nested `fusion-accounts=N/M ingested`.

### D3: `done` / `total` meaning

- **Choice**: `done` = items registered into the operation-run cache for that population. `total` = known census (`X-Total-Count` / search total) when known; otherwise `done`. Fusion/identities update on bulk-ingest chunks. Managed updates after each page’s `setManagedAccount` registration, aggregated across sources (same aggregate idea as today’s managed `fetched`, but not written to the shared slot).
- **Reason**: Discovery Q5; managed has no leftover ingest loop.
- **Considered alternatives**: HTTP `onPageProgress` for Fusion (stage, not who).

### D4: Heartbeat baselines

- **Choice**: Independent `previousDone` per population key. First tick that includes a key omits that key’s Δ. Leaving Fetch clears the bag so Refresh `setProgress` is not mixed. Do not reset Fusion/managed baselines when identities appear later.
- **Reason**: Avoids today’s fetched→ingested baseline wipe.
- **Considered alternatives**: Single delta on a hidden primary counter.

### D5: Ingested unit

- **Choice**: Stop driving Fetch STATUS with unit `ingested`. Keep DETAIL ingest start and event-loop yields. Glossary: **Ingested** names the work, not the Fetch pipeline fraction.
- **Reason**: Proposal B.
- **Considered alternatives**: Proposal C (who + stage).

## Risks / Trade-offs

[Risk] Scrapers grepping Fetch `progress=` / `fetched` / `ingested` break → Mitigation: changelog + observability doc examples; keep `progress=` on later phases.

[Trade-off] STATUS lines get longer → Reason: one line still greps as `STATUS`; two inventories were unreadable.

[Trade-off] Operators cannot see HTTP vs ingest on STATUS → Reason: accepted in B; `queue-pending` and DETAIL remain.

[Risk] Managed `done` (registered) vs `total` (`X-Total-Count` before JMESPath) can disagree → Mitigation: same class of gap as today’s HTTP loaded vs collected; do not invent a second managed total.

## Migration Plan

N/A — log-text and in-process progress API only. Roll forward with connector version; no data migration. Rollback is revert.

## Open Questions

None.
