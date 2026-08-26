## Context

Uncorrelated **authoritative accounts** enter the identity Match sweep against the Fusion identity **baseline** (M ≈ 100k minimum). Cost is `N × K × scorer`, where K is identities actually compared. Today MatchingService builds a padded-trigram index over indexable mandatory attributes and intersects postings in `getCandidates`. That filter is not a necessary condition for Jaro-Winkler (counterexample: `abcdef` vs `bacdfe` ≈ 0.889, no shared padded trigram). `scoreFusionAccount` then stops after the first K passing identities (`fusionMaxCandidatesForForm`, default 3) and may break on the first exact match when auto-merge is enabled. Forms later re-sort stored matches, so they never see identities that were never scored.

`getCandidates` returns `undefined` when the index is unbuilt or there are no indexable mandatory attributes; the dispatcher scores `allFusionIdentities`. Specs say `fullScanFallbackCount` increments on that path; the current implementation returns `undefined` without incrementing.

Deferred drain, Record unique registration, and worker threads are out of this change.

Drift check: `git rev-parse --short HEAD` at apply time.

## Goals / Non-Goals

**Goals:**
- Recall-safe **candidate blocking** so K ≪ M for algorithms with proven predicates.
- Identity scoring retains **top-K identity matches** (form ordering), not first-K.
- Small **exhaustive-scoring oracle** tests; never exhaustive-score 100k in production or CI.
- FusionRun counters: identity comparisons, candidate-set sizes, honor `fullScanFallbackCount`.
- Keep `buildTrigramIndex` as the sole public scoring-prep entry during init (builds every identity-side blocking index).

**Non-Goals:**
- Deferred-phase O(P²) scoring, sequential drain, or deferred comparison metrics.
- Record unique registration / historical two-source cookbooks.
- Worker threads / native thread pools for scorers.
- New operator settings or changing `fusionMaxCandidatesForForm`.
- Changing combined-score formula, mandatory/skip semantics, or numeric fast-path reconstruction.
- Fetch/Refresh performance.

## Decisions

### D1: Blocking is per-rule, then intersect

Each **mandatory** matching rule with `(fusionScore ?? 0) > 0` MAY contribute a candidate set only if that rule’s algorithm has a **proven recall-safe** blocker. The account’s candidate set is the intersection of those sets (after `excludeIds`). A rule with no proven blocker does not filter.

If zero mandatory rules contribute a blocker, `getCandidates` returns `undefined` (full baseline) and increments `fullScanFallbackCount`.

Mandatory-missing block is unchanged: no non-missing value for any *indexable* mandatory attribute → empty Set, `mandatoryMissingBlockCount`, no full scan.

### D2: Proven blockers in this change

| Algorithm | Blocker | Recall argument |
|-----------|---------|-----------------|
| Binary | Exact value index (`normalized value → identity ids`) | Mandatory Binary match requires identical strings; non-equal identities cannot pass. |
| LIG3 | Length-ratio buckets using the same bound already applied in the LIG3 scorer | Identities outside the bound cannot reach `fusionScore`. |
| Jaro-Winkler, Dice, double-metaphone, name-matcher, custom Velocity | None in this change | No proven necessary condition from padded-trigram intersection (JW counterexample). |

Padded trigram intersection MUST NOT be applied as a sole or intersecting filter for unsafe algorithms. Trigram code MAY remain for tests or a future proven bound; it is not the default identity blocker after this change.

**STOP:** Do not ship Dice/metaphone/name-matcher/JW “approximate” indexes without an oracle fixture that includes a known false-negative of that index.

### D3: Mixed mandatory rules

Example: mandatory Binary email + mandatory JW name → candidate set is Binary hits only (JW does not shrink the set). Identities that fail Binary cannot match; identities that pass Binary are scored including JW.

Example: only mandatory JW → `undefined` / full baseline + fallback counter. Correctness over the previous unsafe trigram shrink.

### D4: Score the whole candidate set; keep top-K

Remove identity-phase first-K break and exact-match mid-loop break.

After comparing every identity in the pool (`getCandidates` Set, or full baseline on `undefined`):

1. Rank stored identity-origin `FusionMatch` rows with the same comparator as `compareMatchesForForm`.
2. Drop matches beyond K (`fusionMaxCandidatesForForm`).
3. Match outcome dispatch uses remaining matches as today (exact → auto-merge if enabled, else review form with those candidates).

When multiple exact matches exist, auto-merge the rank-1 identity after this sort (score, then identity id) — not iteration order.

Deferred `scoreFusionAccount` keeps unbounded comparison (no K cap), as today.

### D5: Identity-side indexes live on FusionRun

Binary postings and LIG3 length buckets are run-scoped, built in `buildTrigramIndex` (name kept; method builds all blocking indexes). Compact identity ids in postings; resolve to `FusionAccount` at query time. Same ownership as `trigramIndexByAttribute`.

Optional: precompute identity-side scorer features already covered by existing WeakMaps (LIG3, name normalization, name-matcher tokens) — no new cache unless a blocker needs it.

### D6: Observability

On FusionRun (initialized 0):

- `fullScanFallbackCount` — increment when `getCandidates` returns `undefined` (fix spec gap).
- `identityComparisonCount` — sum of identity-phase `compareFusionAccounts` calls.
- `identityCandidateSetSizeSum` — sum of `|candidate set|` per identity-scored account; use baseline size when the pool was `undefined`.

Process epilogue logs these when any are non-zero, next to existing mandatory-missing / full-scan lines. Docs in `observability.md`.

Do not log per-account INFO.

### D7: Oracle is a test artefact

New tests (hundreds of identities, not 100k):

- Planted JW pair with no shared padded trigram and similarity ≥ configured mandatory threshold → production path MUST include that identity in top-K if it ranks there.
- First-K trap: three weak early passers, one stronger later identity → stored/form candidates are the true top-K.
- Binary unique value → K = 1 comparison.
- Oracle helper scores the same account against every fixture identity with K disabled and blocking disabled; production top-K identity ids and combined scores MUST match.

Production code paths MUST NOT call the oracle.

## Risks / Trade-offs

[HIGH] JW/name-matcher/custom-only tenants lose unsafe trigram filtering → full baseline scoring until a proven blocker exists. Mitigation: fallback counter + epilogue; Binary/LIG3 configs get cheap K; do not reintroduce trigram to hide the cost.

[MED] Removing exact-match early exit increases comparisons when the candidate set is large and the first identity is already exact. Mitigation: Binary exact index makes that set tiny for exact-id rules; full-set scoring is required for correct top-K.

[MED] Review forms may list different identities than first-K builds. Mitigation: this is the intended correctness fix; changelog MUST say so.

[LOW] `buildTrigramIndex` name becomes a misnomer. Mitigation: keep the public name (living spec); document that it builds all blocking indexes.

## Migration Plan

N/A — connector-side scoring behavior; no ISC API or config schema migration. Rollback is revert. Operators with JW-only mandatory rules should expect higher identity-phase CPU and a non-zero `fullScanFallbackCount` until a future proven JW blocker.

## Open Questions

None. `N` (uncorrelated authoritative volume) is unknown; design crushes `K` regardless.
