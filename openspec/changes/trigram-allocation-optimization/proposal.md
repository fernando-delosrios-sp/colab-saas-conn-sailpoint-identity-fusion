## Why

Trigram index build and query paths in `trigramIndex.ts` extract sliding 3-character windows using per-iteration character concatenation (`padded[i] + padded[i + 1] + padded[i + 2]`). Each window creates transient strings on a hot path invoked for every mandatory matching attribute during index construction and for every managed account pre-filter query. Replacing concatenation with `substring` eliminates redundant intermediate allocations with no behavior or API change.

## What Changes

**Trigram window extraction in `extractTrigrams`**
- From: Character concatenation in the sliding-window loop
- To: `padded.substring(i, i + 3)` per window
- Reason: Reduce per-iteration string allocation overhead during index build
- Impact: Non-breaking; identical trigram sets

**Trigram lookup in `queryAttributeIndex`**
- From: Character concatenation when resolving index buckets
- To: `padded.substring(i, i + 3)` per window
- Reason: Reduce per-iteration string allocation overhead during candidate pre-filter
- Impact: Non-breaking; identical candidate sets

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `matching-service`: Document trigram window extraction invariants (padding, window size, identical trigram sets and candidate query results)

## Impact

- **Code:** `src/services/matchingService/trigramIndex.ts` (`extractTrigrams`, `queryAttributeIndex` only)
- **Tests:** Existing `trigramIndex.test.ts` must pass unchanged
- **Operations:** Reduced allocation rate during matching pre-filter; no config or deployment changes
- **Dependencies:** None
