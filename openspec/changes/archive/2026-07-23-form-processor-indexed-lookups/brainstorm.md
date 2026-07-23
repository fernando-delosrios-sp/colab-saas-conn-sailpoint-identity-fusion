# Brainstorm: Replace Linear Scans with Map Lookups in Form Processing

**Source:** Advisor plan 004 (`advisor-plans/004-form-processor-indexed-lookups.md`)  
**Written against commit:** `3a8b4ac`

## Background

`formProcessor.ts` extracts account info, candidate IDs, and correlated identity IDs from completed form instances. Form input arrives in two shapes:

1. **Flat** — `{ account: '...', name: '...', source: '...', candidates: '...' }`
2. **Dictionary** — object keyed by arbitrary keys, each value an input object `{ id, value?, description? }`

Dictionary extraction currently uses `Object.values(dict).find(x => x?.id === fieldId)`, which allocates an array of all values and scans linearly for every field read. Hot paths include `readCorrelatedIdentityId`, `extractAccountInfoFromFormInput` (account, name, source), and `extractCandidateIdsFromFormInput`.

## Decision Chain

### Q1: What problem are we solving?

Redundant `Object.values()` allocations and O(n) linear scans on dictionary-shaped form inputs during form decision processing. Medium leverage, no dependencies, no API or config changes. Behavior must remain identical for flat and dictionary structures.

### Q2: What approaches were considered?

**A. Direct key lookup + `for...in` fallback (recommended)**  
Check `dict[fieldId]` first (O(1) when keys align with field ids). Fall back to iterating object keys with `for...in` when values are keyed differently but still contain matching `id` properties.
- Eliminates `Object.values()` array allocation
- Preserves compatibility with non-key-aligned dictionary structures (existing tests use keys `a`, `b`, `c`)
- Minimal diff localized to extraction helpers

**B. Pre-build id→input Map once per formInput**  
Single pass to index all inputs by `id`, then O(1) lookups.
- Rejected: Overkill for 3–4 field reads per form instance; adds Map allocation and helper abstraction

**C. Key-only lookup (drop fallback scan)**  
Assume dictionary keys always equal field ids.
- Rejected: Existing tests and production forms use arbitrary keys (`a`, `b`, `c`); would break behavior

**D. Shared `lookupFormField(dict, fieldId)` helper**  
Extract common direct-key + fallback pattern once.
- Considered but deferred: Advisor plan inlines pattern per function; two helpers with slightly different value checks may not justify abstraction yet (YAGNI)

### Q3: Does direct lookup preserve behavior?

Yes. For each extractor:

| Function | Field(s) | Flat path | Dictionary path |
|----------|----------|-----------|-----------------|
| `readCorrelatedIdentityId` | `FusionAttribute.IdentityId` | unchanged (`readString`) | direct key + fallback |
| `extractAccountInfoFromFormInput` | `account`, `name`, `source` | unchanged | direct key + fallback per field |
| `extractCandidateIdsFromFormInput` | `candidates` | unchanged | direct key + fallback |

Existing unit tests cover flat structure, dictionary with arbitrary keys, and `description` fallback when `value` is empty.

### Q4: What stays out of scope?

- `formBuilder.ts` and form schema construction
- FormService orchestration or FusionRun state
- New public APIs or config settings
- Performance benchmarking / allocation counting

## Agreed Approach

Replace `Object.values(...).find(...)` with direct property lookup on the expected field id, followed by a `for...in` fallback when keys do not align. Apply to `readCorrelatedIdentityId`, `extractAccountInfoFromFormInput`, and `extractCandidateIdsFromFormInput` only.

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Micro-optimization (avoids values-array allocation per lookup) | Form processing runs per answered instance; multiple fields extracted per call |
| Inline pattern vs shared helper | Keep inline per advisor plan; revisit if a fourth caller appears |
| No dedicated benchmark | Existing `formProcessor.test.ts` guards behavior |

## Done Criteria (from advisor plan)

- `Object.values()` allocation eliminated from field extraction helpers
- Direct key indexing resolves attributes in O(1) when keys align
- All form processor unit tests pass
