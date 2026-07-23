# Brainstorm: Trigram Window String & Set Allocation Reduction

**Source:** Advisor plan 003 (`advisor-plans/003-trigram-allocation-optimization.md`)  
**Written against commit:** `3a8b4ac`

## Background

`extractTrigrams` and `queryAttributeIndex` in `src/services/matchingService/trigramIndex.ts` run on every trigram index build and candidate pre-filter during fuzzy identity matching. Both functions slide a 3-character window over a padded normalized string. The current loop uses character concatenation:

```typescript
padded[i] + padded[i + 1] + padded[i + 2]
```

Each iteration allocates a transient 3-character string. For a value of length N, the loop runs N+1 times (with standard two-space padding), so both index build and query paths multiply allocations across mandatory matching attributes and every managed account comparison.

## Decision Chain

### Q1: What problem are we solving?

Redundant per-iteration string allocations in trigram extraction and index query hot paths. Medium leverage, no dependencies, no config or API changes. Behavior must remain identical.

### Q2: What approaches were considered?

**A. `substring(i, i + 3)` (recommended)**  
Replace concatenation with a single substring call per window:
```typescript
result.add(padded.substring(i, i + 3))
```
- Same 3-character strings as concatenation for padded ASCII/LIG3-normalized input
- One allocation per trigram (unavoidable for Set/Map keys) without two intermediate char-to-string coercions
- Minimal diff in two functions

**B. `slice(i, i + 3)`**  
Semantically equivalent for the padded strings used here.
- Rejected: `substring` matches advisor plan and existing codebase style; no meaningful difference for this use case

**C. Shared internal `forEachTrigram(padded, callback)` helper**  
Extract the sliding-window loop once, used by both functions.
- Rejected: Adds abstraction for a 4-line loop; YAGNI for this change

**D. Numeric trigram encoding (char codes packed into integer keys)**  
Avoid string keys entirely in the index.
- Rejected: Breaks `Map<string, …>` contract, index serialization assumptions, and test expectations; far out of scope

### Q3: Does `substring` preserve behavior?

Yes. For the padded normalized strings produced by `normalizeLIG3` and the fixed `` `  ${normalized} ` `` padding:
- Window count unchanged: `i` from `0` to `len - 3`
- Each window is exactly three characters — same values as `'a' + 'b' + 'c'`
- Existing unit tests assert exact trigram sets (e.g. `'foo'` → `['  f', ' fo', 'foo', 'oo ']`)

`queryAttributeIndex` already builds a candidate `Set<FusionAccount>` directly; the optimization is only replacing concatenation with `substring` in the lookup loop — no change to deduplication or bucket iteration semantics.

### Q4: What stays out of scope?

- `normalizeLIG3` and other scoring helpers
- Trigram index structure (`TrigramIndex` type, bucket layout)
- MatchingService orchestration or FusionRun index lifecycle
- New tests beyond existing `trigramIndex.test.ts` (behavior unchanged)
- Performance benchmarking / allocation counting

## Agreed Approach

Replace character concatenation with `padded.substring(i, i + 3)` in both `extractTrigrams` and `queryAttributeIndex`. No API, config, or normalization changes.

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Micro-optimization (saves intermediate concat allocations) | High call volume during index build + per-account queries makes it worthwhile |
| No dedicated benchmark in this change | Existing trigram unit tests are sufficient regression guard |
| Spec documents trigram invariants, not allocation count | Allocation is implementation detail; identical trigram sets and candidate results are the testable contracts |

## Done Criteria (from advisor plan)

- Loop string concatenation replaced with `substring`
- Trigram matching results match previous behavior exactly
- All matching tests pass
