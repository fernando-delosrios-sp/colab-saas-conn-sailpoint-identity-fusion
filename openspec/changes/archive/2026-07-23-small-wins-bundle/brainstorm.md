# Brainstorm: Small Wins Bundle — JW Alloc, Full-Scan Observability, Array Copies

**Source:** Advisor plan 004 (`advisor-plans/004-small-wins-bundle.md`)  
**Written against:** current `main` branch

## Background

Three independent micro-optimizations and observability gaps surfaced during performance review of the matching and fusion run hot paths:

1. **F5 — Jaro match arrays:** `jaroSimilarity` in `stringComparison.ts` allocates `new Array(len).fill(false)` on every call. Jaro-Winkler runs frequently during fuzzy scoring; boolean arrays with `.fill()` add GC pressure.

2. **F7 — Silent full-scan fallback:** When `getCandidates` cannot block by trigram (all mandatory attributes missing on the account), it returns `undefined` and `matchOutcomeDispatcher` falls back to scanning all fusion identities — O(m×n) behavior with no log or metric.

3. **F8 — Defensive array copies on iteration:** `FusionRun.allFusionAccounts` getter copies via `Array.from` on every access. Several callers only iterate. `FusionAccount.fusionMatches` getter always spreads; read-only callers should use `fusionMatchesRaw`.

## Decision Chain

### Q1: What problem are we solving?

Reduce allocation overhead on hot paths and make trigram blocking ineffectiveness visible to operators. No API contract changes for external consumers; internal call sites updated where iteration-only access is sufficient.

### Q2: Part A — How to optimize Jaro match tracking?

**A. `Uint8Array` instead of `Array<boolean>` (recommended)**  
Replace `new Array(len).fill(false)` with `new Uint8Array(len)` (zero-initialized). Assign `1` instead of `true`; truthy checks unchanged.

- Lower allocation cost, no per-element fill
- Identical numeric Jaro results (existing tests are the contract)

**B. Module-level reusable buffers sized to max seen length**  
Pool and grow typed arrays across calls.

- Rejected: Adds thread-safety / reentrancy concerns; Jaro is synchronous but pooling is over-engineering for this bundle

**C. Bit-packed integer flags**  
Single number bitmask for short strings.

- Rejected: Complexity; strings in scoring can exceed practical bit width

### Q3: Part B — How to surface full-scan fallback?

**A. Run-level counter + throttled warnings + epilogue summary (recommended)**  
Add `FusionRun.fullScanFallbackCount`. Increment in `getCandidates` when returning `undefined` due to missing mandatory attrs. Log first 5 and every 100th via `LogService`. Warn in terminal summary when count > 0.

- Operators can detect misconfiguration (empty mandatory attrs, bad mapping)
- Throttling avoids log floods on large tenants

**B. Log every fallback unconditionally**  
- Rejected: Could emit thousands of warnings per run

**C. Metric only, no logs**  
- Rejected: Harder to diagnose without log context; summary still needed

**Signature change:** Add optional `log?: LogService` to `getCandidates` (escape hatch from advisor plan). Update `matchOutcomeDispatcher` caller to pass log.

### Q4: Part C — How to reduce array copies?

**A. Add `fusionAccountsIterable()` generator; switch iteration-only callers (recommended)**  
Keep `allFusionAccounts` getter for callers that need a mutable array (spreads in `fusionService.ts:848,870,1026`). Update `fusionService.ts:683`, `decisionProcessor.ts:55` to use iterable.

- Matches existing pattern: `allFusionIdentities` already returns `Map.values()` without copy
- No behavior change for spread call sites

**B. Change getter to return iterable directly**  
- Rejected: Breaking change for spread/array consumers

**For `fusionMatches`:** Audit shows `matchingService.ts` already uses `fusionMatchesRaw`. Other callers that spread (`formService`, `matchOutcomeDispatcher`) need copies or sort — no getter change. Document preference for `fusionMatchesRaw` in read-only paths only if a caller is found; advisor lists no mandatory change beyond audit.

### Q5: What stays out of scope?

- Trigram index structure changes (separate change: trigram-allocation-optimization)
- Changing full-scan fallback semantics (still falls back to all identities)
- Performance benchmarking / allocation counting
- Changing `fusionMatches` getter behavior (copy preserved for mutability safety)

## Agreed Approach

Bundle three parts in one change:

- **Part A:** `Uint8Array` in `jaroSimilarity`
- **Part B:** `fullScanFallbackCount` on FusionRun, optional log param on `getCandidates`, throttled warnings, epilogue summary
- **Part C:** `fusionAccountsIterable()` + caller audit for iteration-only paths

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Micro-optimizations bundled together | Independent parts, single review cycle, shared verification |
| Optional `log` on `getCandidates` | Preserves test stub simplicity |
| Throttled warning thresholds (5, then every 100) | Arbitrary but prevents noise; adjustable later |
| Keep copying getters for safety | Call sites that need arrays opt in explicitly |

## Done Criteria (from advisor plan)

1. `npm run typecheck` passes
2. `npm test` passes
3. `npm run lint` passes
4. Full-scan fallbacks appear as warnings when trigram blocking is ineffective
