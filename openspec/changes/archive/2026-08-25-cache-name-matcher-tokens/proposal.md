## Why

The default matching algorithm is `name-matcher`. Each managed-account × identity comparison re-splits normalized names into tokens and re-encodes phonetic codes with `doubleMetaphone`, even though the same identity tokens appear in thousands of comparisons per aggregation. Normalized strings are already cached on `FusionRun`; token and phonetic work is not.

## What Changes

**Name-matcher token cache on FusionRun**
- From: `matchNormalized` splits normalized strings on every comparison.
- To: `FusionRun` holds a run-scoped `Map<string, string[]>` (normalized name → tokens). First access splits and caches; subsequent comparisons reuse.
- Reason: Token splits are identical for the same normalized name across all comparisons in a run.
- Impact: New fields on `FusionRun`; `nameMatching.ts` reads/writes through run or passed token and phonetic maps.

**Name-matcher phonetic code cache on FusionRun**
- From: `doubleMetaphone` runs for every token on every comparison.
- To: `FusionRun` holds `Map<string, [string, string]>` (token → codes). At most one encode per distinct token per run.
- Reason: Phonetic codes depend only on the token string.
- Impact: Same as above; no scoring threshold or weight changes.

**Unchanged**
- Name-matching semantics (weights, token order, phonetic thresholds).
- LIG3 and other algorithm caches.
- Trigram blocking and match sweep orchestration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `matching-service`: Name-matcher token splits and phonetic codes SHALL be cached on `FusionRun` for the run; `doubleMetaphone` SHALL be invoked at most once per distinct token per run.

## Impact

- `src/model/fusionRun.ts` — new cache maps
- `src/services/matchingService/nameMatching.ts` — consume caches
- `src/services/matchingService/scoringHelpers.ts` — pass cache context into name-matcher path if needed
- Tests: `nameMatching.test.ts`, `matchService.test.ts`
- No connector-spec or configuration changes

## Apply status

- **Status**: TODO
- **Depends on**: none
- **Issue**:
