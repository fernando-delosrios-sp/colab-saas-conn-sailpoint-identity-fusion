## Scope

In: identity-phase Match scoring for **uncorrelated authoritative accounts** against the Fusion identity **baseline** (~100k identities minimum): algorithm-aware **candidate blocking**, globally correct **top-K** identity matches, a small exhaustive-scoring **oracle** in tests, and per-account comparison / candidate-set observability.

Out: deferred drain / O(P²) peer scoring; Record unique registration and two-source historical-record cookbooks; worker-thread parallelization of scorers; exhaustive scoring in production or CI at 100k identities; Fetch/Refresh wall time.

## Language

**Candidate blocking** (`promote`):
A recall-safe pre-filter that selects which Fusion identities MAY be scored for one uncorrelated managed account. The selected set is the candidate set; identities outside it MUST NOT be able to pass matching rules under the configured algorithms.
_Avoid_: trigram (too specific — one blocking method), full scan (the failure mode), getCandidates (API name)

**Algorithm-aware blocking** (`promote`):
Candidate blocking whose predicates are proven for the matching algorithms in force (for example Binary exact index, LIG3 length bounds). Generic shared-trigram intersection is not algorithm-aware for Jaro-Winkler or name-matcher unless a bound proves it cannot drop a passing identity.
_Avoid_: generic trigram blocking as the sole filter

**Top-K identity matches** (`promote`):
The K highest combined-score identity candidates that pass the review threshold, independent of scoring iteration order. K is `fusionMaxCandidatesForForm` (default 3). Distinct from stopping after the first K passing identities encountered.
_Avoid_: first-K, early cap, maxIdentityMatches as “first N found”

**Exhaustive-scoring oracle** (`promote`):
A test-only path that scores a managed account against every identity in a small fixture (hundreds, not 100k) with no blocking and no first-K stop, used to assert top-K equivalence of the production path.
_Avoid_: production full scan, 100% corpus scoring at tenant scale

**Identity comparison** (`draft`):
One `compareFusionAccounts` invocation of an uncorrelated account against one Fusion identity during the identity sweep. Observability counts these, not deferred comparisons.
_Avoid_: scoring (ambiguous with the whole Match step)

**Baseline** (`conflicts-with-canonical` — reuse, do not redefine):
Canonical: existing identities in identity scope used as comparison points during Match. This change treats M ≈ 100k as the minimum baseline size for performance intent; it does not change what a baseline identity is.

**Authoritative accounts** (`conflicts-with-canonical` — reuse):
Uncorrelated rows from authoritative sources that enter Match scoring and may create Fusion accounts on non-match. This change’s workload is those rows vs the baseline, not Record non-matching registration.

## Decisions

Context: Identity Match cost is `N` uncorrelated authoritative accounts × `K` identities actually scored × scorer cost. Generic trigram blocking is not recall-safe for all algorithms (Jaro-Winkler `abcdef` vs `bacdfe` can pass ~0.889 with no shared padded trigram). `scoreFusionAccount` stops after the first K passing identities (and may auto-merge the first exact match), so review forms can hide better candidates. `fullScanFallbackCount` is specified but not incremented on the current getCandidates path when blocking is unavailable (index unbuilt / no indexable mandatory attributes still returns `undefined` without increment). Cambridge logs (~102k Fusion accounts) are Fetch-dominated with Match scoring off — not a Match baseline.

Q1: Workload?
Chosen: **Uncorrelated authoritative accounts vs Fusion identity baseline.** Not Record unique-registration; not historical two-source deployment.

Q2: Identity vs deferred?
Chosen: **Identity phase only for this change.** Deferred drain stays as specified today.

Q3: Blocking strategy?
Chosen: **Algorithm-aware blocking.** Binary → exact lookup. LIG3 → length (and other proven) bounds. Do not use generic trigram as the sole filter for Jaro-Winkler, name-matcher, or custom Velocity unless a bound proves recall. When no recall-safe blocker applies, still MUST NOT silently drop identities that could pass — full identity pool remains the last resort, with observability.

Q4: Candidate cap?
Chosen: **Globally correct top-K** among identities that were scored (the candidate set). Replace first-K early exit. Exact-match auto-merge still allowed after the candidate set is fully scored (or after an exact match is found **and** remaining identities cannot outrank it for top-K — production MAY skip remaining identities only when they cannot enter top-K). When multiple exact matches exist, auto-merge the highest-ranked exact identity using the same ordering as form candidate sort (combined score, then stable identity id).

Q5: Oracle?
Chosen: **Small fixture tests only.** Hundreds of identities, planted near-misses including trigram false-negatives. Production and CI MUST NOT exhaustive-score 100k identities.

Q6: Worker threads?
Chosen: **Out.** Promise concurrency already exists; CPU is single-threaded. Revisit after K is small.

Q7: Identity-side feature caches?
Chosen: **Allowed** as FusionRun-scoped precompute (same pattern as name-matcher token caches). Compact identity ids in postings preferred over large `Set<FusionAccount>` if indexes grow.

## Open questions

None blocking.

Assumption: typical `N` may be hundreds (steady state) or tens/hundreds of thousands (bulk authoritative load); design MUST crush `K`, not assume small `N`.

Assumption: `fusionMaxCandidatesForForm` remains the operator-visible K; no new connector-spec setting in this change.

Deferred: incrementing `fullScanFallbackCount` on `undefined` getCandidates returns (spec already requires it; implementation gap) — include as a small correctness fix if the identity-phase observability work touches that path.

## Scenarios discussed

- Binary-only mandatory rule: candidate set is exact-value hits; non-equal identities never scored.
- Jaro-Winkler mandatory ≥80: identity shares no padded trigram but would score ≥80 → MUST remain in candidate set (trigram-only blocking FAIL).
- LIG3 mandatory: identities outside proven length-ratio bound never scored; identities inside the bound still scored.
- First-K vs top-K: identities 1..3 pass weakly, identity 1000 scores higher → form and stored matches SHALL be the true top-K.
- Two exact matches: auto-merge SHALL pick the deterministic winner, not whichever identity appeared first in iteration order.
- Empty candidate set (mandatory missing block): still zero comparisons (existing spec).
- No recall-safe blocker (e.g. custom Velocity only): full baseline MAY be scored; `fullScanFallbackCount` (or successor comparison counters) SHALL make that visible.
- Oracle fixture: production path top-K equals exhaustive oracle top-K for planted pairs.
- Authoritative non-match after identity phase: existing source-type dispatch (new Fusion account); deferred pending only if that source still has deferred matching on — unchanged.
