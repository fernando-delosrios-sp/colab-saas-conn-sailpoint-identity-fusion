## Why

Identity Match for uncorrelated authoritative accounts can scan ~100k baseline identities per account. Generic trigram blocking is not recall-safe for every algorithm (Jaro-Winkler can pass with no shared padded trigram), and scoring stops at the first K passing identities, so review forms can hide better matches. Operators also cannot see how many identities were actually compared. This change makes blocking algorithm-aware, selects globally correct top-K, and measures comparisons so 100k-identity runs stay honest.

## What Changes

**Algorithm-aware candidate blocking**
- From: `getCandidates` intersects padded-trigram postings for every indexable mandatory attribute, regardless of algorithm; unsafe filters can drop identities that would pass scoring.
- To: Candidate set is the intersection of per-rule **recall-safe** blockers only (Binary exact index, LIG3 length bounds, other proven predicates). Rules without a proven blocker do not filter. If no mandatory rule can filter, `getCandidates` returns `undefined` and the dispatcher scores the full baseline.
- Reason: Crush K without dropping true matches.
- Impact: Behavior change for tenants whose trigram index previously excluded Jaro/name/custom near-misses; those identities become reachable again.

**Globally correct top-K identity matches**
- From: `scoreFusionAccount` stops after the first `fusionMaxCandidatesForForm` passing identity matches (and may stop at the first exact match when auto-merge is on).
- To: Score the entire candidate set (or full baseline on `undefined`). Retain the top K potential matches using the same ordering as review-form candidate sort. Auto-merge, when enabled, uses the best exact match after that ranking — not whichever identity appeared first.
- Reason: Forms and auto-merge must reflect the best identities, not iteration order.
- Impact: Review candidate lists may change when a better identity appeared after the first-K cutoff; exact-match accounts may score more identities unless Binary blocking shrinks the set.

**Identity-phase observability**
- From: `matchScoringMs` plus trigram counters; `fullScanFallbackCount` specified but not incremented on `undefined` `getCandidates`; no comparison or candidate-set size totals.
- To: Increment `fullScanFallbackCount` when blocking is unavailable; accumulate identity comparison count and candidate-set size across the identity sweep; Process epilogue reports them.
- Reason: A 100k-identity run must show whether K was blocked or the full baseline was scored.
- Impact: Non-breaking logs/metrics.

**Exhaustive-scoring oracle (tests only)**
- From: No automated check that the production identity path equals score-everyone on a fixture.
- To: Small-corpus tests (hundreds of identities, planted near-misses including trigram false-negatives) assert production top-K equals the oracle. Production and CI MUST NOT exhaustive-score a 100k baseline.
- Reason: Prove recall of blocking and top-K without pretending 100k exhaustive scoring is feasible.
- Impact: New matching-service tests only.

**Unchanged**
- Deferred drain, Record unique registration, combined-score math, mandatory/skip-missing semantics, `scoringMaxConcurrency`, numeric identity fast path.
- No new connector-spec setting; K remains `fusionMaxCandidatesForForm`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `matching-service`: Algorithm-aware blocking; top-K retention; oracle tests; `buildTrigramIndex` remains the public init entry and builds all identity-side blocking indexes.
- `match-outcome-dispatch`: Identity pool still uses `getCandidates` Set vs `undefined` full baseline; no first-K early stop at the dispatcher.
- `fusion-run`: Identity comparison and candidate-set size counters; `fullScanFallbackCount` increment contract honored.
- `account-list-operation`: Process epilogue reports identity comparison / candidate-set / full-scan counters.
- `ubiquitous-language`: Candidate blocking, algorithm-aware blocking, top-K identity matches, exhaustive-scoring oracle.

## Impact

- `src/services/matchingService/matchingService.ts` (`buildTrigramIndex`, `getCandidates`, `scoreFusionAccount`)
- `src/services/matchingService/trigramIndex.ts` (trigram remains one blocker, not the universal filter)
- New or extended blocking helpers beside matchingService
- `src/model/fusionRun.ts`
- `src/operations/helpers/accountListPhases.ts` (epilogue)
- Tests: `matchService.test.ts`, `trigramIndex.test.ts`, new oracle/top-K/blocking tests; `matchOutcomeDispatcher.test.ts` if dispatch assumptions change
- Docs: `docs/reference/observability.md`, `docs/reference/match-flow.md`
- No connector-spec.json field changes
