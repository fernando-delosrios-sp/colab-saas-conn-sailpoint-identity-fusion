## Context

MatchingService builds an inverted trigram index over fusion identity attribute values to pre-filter candidates before full similarity scoring. The index lives in `src/services/matchingService/trigramIndex.ts`:

- `extractTrigrams(normalized)` — produces a `Set<string>` of 3-character windows from a LIG3-normalized value with standard two-space padding
- `buildAttributeIndex` — calls `extractTrigrams` for each indexed identity attribute
- `queryAttributeIndex` — slides the same window over a query value and unions bucket identities into a candidate set

Current extraction (lines 19–21 and 62–63):

```typescript
result.add(padded[i] + padded[i + 1] + padded[i + 2])
// ...
const trigram = padded[i] + padded[i + 1] + padded[i + 2]
```

Character concatenation coerces each char to a string before joining, creating more transient allocations than `substring` for the same resulting 3-character key.

## Goals / Non-Goals

**Goals:**
- Replace concatenation with `substring(i, i + 3)` in `extractTrigrams` and `queryAttributeIndex`
- Preserve identical trigram sets for all normalized inputs
- Preserve identical candidate sets from `queryAttributeIndex`
- Pass all existing `trigramIndex.test.ts` cases without modification

**Non-Goals:**
- Changing `normalizeLIG3` or scoring helpers
- Refactoring index structure (`TrigramIndex`, bucket sets)
- Shared trigram-loop abstraction
- Numeric trigram key encoding
- Performance benchmarking or allocation counting

## Decisions

### D1: `substring` vs character concatenation

- **Choice:** `padded.substring(i, i + 3)` in both functions
- **Reason:** Produces identical 3-character strings with fewer intermediate allocations; minimal diff
- **Considered alternatives:** `slice` — equivalent here but advisor plan and convention favor `substring`; char concat — current code, higher allocation cost

### D2: Inline loop vs shared helper

- **Choice:** Keep the sliding-window loop inline in each function; only change the window extraction expression
- **Reason:** Two 4-line loops do not justify a new abstraction; matches existing file structure
- **Considered alternatives:** `forEachTrigram(padded, fn)` helper — rejected (YAGNI)

### D3: Spec delta scope

- **Choice:** ADDED requirement documenting trigram window extraction invariants (padding, window size, behavioral equivalence)
- **Reason:** Allocation is an implementation detail; trigram set and candidate query correctness are the testable contracts
- **Considered alternatives:** No spec change — rejected; trigram blocking is a documented matching-service capability

## Risks / Trade-offs

- [Risk] Subtle trigram mismatch if padding or loop bounds change → Mitigation: Do not alter padding template or loop range; existing unit tests cover `'foo'`, `'a'`, `''`, multi-trigram queries, and deduplication
- [Risk] Unicode surrogate-pair edge cases with `substring` → Mitigation: LIG3 normalization produces ASCII-safe strings; current tests and production path unchanged
- [Trade-off] No dedicated perf benchmark → Accepted: allocation savings validated by code review; full trigram test suite guards behavior

## Migration Plan

N/A — internal implementation optimization. Deploy via normal connector bundle update. No data migration, config changes, or operator action required.

**Rollback:** Revert the two expression changes in `trigramIndex.ts`.

## Open Questions

- None blocking implementation.
