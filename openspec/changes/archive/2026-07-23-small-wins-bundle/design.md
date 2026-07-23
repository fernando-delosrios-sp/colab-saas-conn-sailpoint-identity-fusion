## Context

Identity Fusion matching uses Jaro-Winkler (via `jaroSimilarity`) for fuzzy string scoring, trigram blocking via `getCandidates` to shrink the identity candidate pool, and `FusionRun` as the centralized run state container. Advisor plan 004 identified three independent wins: typed-array match flags in Jaro, observability when trigram blocking cannot filter, and avoiding defensive array copies when callers only iterate fusion accounts.

Current behavior when all mandatory trigram attributes are missing on a managed account: `getCandidates` returns `undefined`, and `matchOutcomeDispatcher` uses `run.allFusionIdentities` — a full scan. This is correct functionally but invisible in logs or run metrics.

## Goals / Non-Goals

**Goals:**
- Reduce per-call allocation in `jaroSimilarity` without changing scores
- Track and surface full-scan fallback events on `FusionRun`
- Provide a non-copying iteration path for fusion accounts; migrate iteration-only callers
- Preserve existing getter contracts where spread or mutation safety requires copies

**Non-Goals:**
- Changing full-scan fallback semantics (still scans all identities when blocking fails)
- Trigram index or window extraction changes (covered by separate change)
- Removing `allFusionAccounts` or `fusionMatches` copying getters
- Performance benchmarking or allocation profiling infrastructure
- Changing `fusionMatches` getter (read-only callers already have `fusionMatchesRaw`)

## Decisions

### D1: Jaro match flags use Uint8Array

- **Choice:** Replace `Array<boolean>.fill(false)` with `new Uint8Array(len)`; set matched cells to `1`
- **Reason:** Zero-initialized typed arrays avoid `.fill()` overhead and boolean hidden-class transitions; truthy checks unchanged
- **Considered alternatives:** Pooled reusable buffers (rejected — reentrancy/pooling complexity); bitmasks (rejected — string length unbounded)

### D2: Full-scan fallback tracked on FusionRun with throttled logging

- **Choice:** Add `fullScanFallbackCount: number = 0` on `FusionRun`. Increment when `getCandidates` would return `undefined` because no mandatory attribute had a value (not when index is unbuilt). Accept optional `log?: LogService`; warn on counts 1–5 and every 100th thereafter. Emit summary warning in terminal epilogue when count > 0.
- **Reason:** Operators need visibility into ineffective blocking without log floods
- **Considered alternatives:** Log every event (rejected — noisy); metrics-only (rejected — harder to diagnose without log line)

### D3: Optional log parameter on getCandidates

- **Choice:** `getCandidates(account, log?, excludeIds?)` — log optional, placed before excludeIds or as second param per advisor (`account, log, excludeIds`)
- **Reason:** Test stubs and unit tests need not inject a logger; production caller (`matchOutcomeDispatcher`) passes `this.deps.log`
- **Considered alternatives:** Required log (rejected — breaks minimal test doubles)

### D4: Non-copying fusion account iteration via generator

- **Choice:** Add `*fusionAccountsIterable(): Iterable<FusionAccount>` yielding `this._fusionAccountMap.values()`. Keep `allFusionAccounts` getter unchanged for spread/array consumers.
- **Reason:** Mirrors `allFusionIdentities` and existing `fusionIdentitiesExcluding` generator pattern
- **Considered alternatives:** Change getter to return iterable (rejected — breaks `[...run.allFusionAccounts, ...]` call sites)

### D5: Caller migration scope for Part C

- **Choice:** Update iteration-only loops in `fusionService.ts` (~683) and `decisionProcessor.ts` (~55). Leave spread sites in `fusionService.ts` (848, 870, 1026) and `matchOutcomeDispatcher.ts` unchanged.
- **Reason:** Spread requires materialized arrays; loops do not
- **Considered alternatives:** Broader audit of all `allFusionAccounts` usages — include `accountListPhases.ts` and tests only if they iterate (report phase passes to downstream; evaluate at implement time)

## Risks / Trade-offs

- [Risk] Uint8Array truthiness differs from boolean only for `0` vs `1` — same as false/true → **Mitigation:** Existing tests assert exact Jaro scores
- [Risk] Log parameter ordering may confuse callers → **Mitigation:** JSDoc on `getCandidates`; single production caller updated
- [Risk] Throttle thresholds (5, every 100) hide severity on medium tenants → **Mitigation:** Epilogue always summarizes total count; thresholds documented as tunable
- [Trade-off] Bundle three unrelated changes → **Acceptance:** Single verification cycle; parts are file-disjoint and independently revertible

## Migration Plan

N/A — This change does not involve deployment changes. Ship as a connector patch release. Rollback is reverting the commit; no config migration.

**Acceptance criteria:**
- `npx tsc --noEmit`, `npm test`, and `npm run lint` pass
- Full-scan fallback test increments `run.fullScanFallbackCount`
- Terminal summary warns when fallback count > 0

## Open Questions

- None blocking. Throttle constants (5, 100) may be tuned after observing production logs.
