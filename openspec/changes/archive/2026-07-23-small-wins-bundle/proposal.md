## Why

Three low-risk improvements surfaced during matching hot-path review: Jaro-Winkler allocates boolean arrays on every similarity call, trigram blocking failures fall back to a full identity scan with no observability, and several fusion-run accessors copy arrays when callers only iterate. Together these add GC pressure and hide misconfiguration that turns candidate pre-filtering into O(m×n) scoring. Bundling them reduces review overhead while keeping each part independently revertible.

## What Changes

**Part A — Jaro match array allocation (`stringComparison.ts`)**
- From: `new Array(len).fill(false)` for match tracking in `jaroSimilarity`
- To: Zero-initialized `Uint8Array(len)` with `1`/`0` flags
- Reason: Lower allocation and fill overhead on a high-frequency scoring path
- Impact: Non-breaking; identical Jaro numeric results

**Part B — Full-scan fallback observability (`matchingService.ts`, `fusionRun.ts`, epilogue)**
- From: `getCandidates` returns `undefined` silently when all mandatory trigram attributes are missing; dispatcher scans all identities
- To: Increment `run.fullScanFallbackCount`, emit throttled warnings via `LogService`, summarize count in terminal epilogue
- Reason: Surface ineffective trigram blocking caused by empty mandatory attributes or mapping gaps
- Impact: Non-breaking; optional `log` parameter on `getCandidates`

**Part C — Iteration without array copies (`fusionRun.ts`, callers)**
- From: `allFusionAccounts` getter copies via `Array.from` on every access; iteration-only callers pay unnecessary cost
- To: Add `fusionAccountsIterable()` generator; switch iteration-only call sites in `fusionService.ts` and `decisionProcessor.ts`
- Reason: Align with existing `allFusionIdentities` pattern; preserve copying getter for spread/array consumers
- Impact: Non-breaking; internal call-site updates only

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `matching-service`: Jaro similarity allocation invariants; full-scan fallback counting and throttled logging when trigram blocking is ineffective
- `fusion-run`: Run-scoped `fullScanFallbackCount` metric; non-copying `fusionAccountsIterable()` accessor for fusion account iteration

## Impact

- **Code:** `stringComparison.ts`, `matchingService.ts`, `matchOutcomeDispatcher.ts`, `fusionRun.ts`, `fusionService.ts`, `decisionProcessor.ts`, `accountListPhases.ts` (terminal summary / epilogue)
- **Tests:** Existing `stringComparison.test.ts` must pass unchanged; add test for `fullScanFallbackCount` increment
- **Operations:** Warning logs and terminal summary when trigram blocking falls back to full scan; reduced allocation on Jaro and fusion account iteration paths
- **Dependencies:** None
