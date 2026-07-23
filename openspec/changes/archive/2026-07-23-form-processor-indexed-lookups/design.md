## Context

The form processor (`src/services/formService/formProcessor.ts`) converts completed SailPoint form instances into `FusionDecision` objects. Form input arrives as either a flat object or a dictionary of input definition objects keyed by arbitrary strings.

Current dictionary extraction (lines 43–45, 113–121, 148–150):

```typescript
Object.values(dict ?? {}).find((x) => x?.id === fieldId && ...)
```

Each call materializes all values into a new array and scans linearly. `extractAccountInfoFromFormInput` performs three such scans when resolving account, name, and source.

## Goals / Non-Goals

**Goals:**
- Replace `Object.values().find()` with direct property lookup followed by `for...in` fallback in all dictionary-path extractors
- Preserve identical results for flat and dictionary form inputs
- Pass all existing `formProcessor.test.ts` cases without modification

**Non-Goals:**
- Changes to `formBuilder.ts` or form schema construction
- FormService orchestration, FusionRun state, or new public APIs
- Shared lookup helper abstraction (unless duplication becomes painful during implementation)
- Performance benchmarking or allocation counting

## Decisions

### D1: Direct key lookup vs pre-built Map

- **Choice:** Direct `dict[fieldId]` check, then `for...in` fallback when direct miss or key misalignment
- **Reason:** Typical forms key inputs by field id or use a small number of arbitrary keys; avoids Map construction for 3–4 reads
- **Considered alternatives:** Id-indexed Map built once per formInput — rejected (extra allocation and helper for marginal gain)

### D2: Fallback strategy

- **Choice:** `for...in` loop comparing `item?.id === fieldId` (same predicate as current `find`)
- **Reason:** Preserves behavior when dictionary keys are arbitrary (`a`, `b`, `c` in tests) while eliminating `Object.values()` allocation
- **Considered alternatives:** Key-only lookup — rejected (breaks existing dictionary tests and known form shapes)

### D3: Scope of functions touched

- **Choice:** `readCorrelatedIdentityId`, `extractAccountInfoFromFormInput`, `extractCandidateIdsFromFormInput` only
- **Reason:** These are the only `Object.values().find` sites in the file; flat-path branches remain unchanged
- **Considered alternatives:** Refactor all formInput reads including `extractSourceType` — rejected (flat string check only, no dictionary scan)

### D4: Spec delta scope

- **Choice:** ADDED requirement under `form-service` documenting dictionary field resolution invariants
- **Reason:** Lookup strategy is an implementation detail; extracted values and flat/dictionary parity are the testable contracts
- **Considered alternatives:** No spec change — rejected; form input parsing is part of form-service responsibility

## Risks / Trade-offs

- [Risk] Direct key lookup returns wrong object if key collides with unrelated property → Mitigation: Validate `item?.id === fieldId` (or value presence) same as current `find` predicate before accepting direct hit
- [Risk] `for...in` includes inherited enumerable properties → Mitigation: Same risk profile as `Object.values` on plain form input objects; existing tests cover real shapes
- [Trade-off] Slightly more code per extractor (direct + loop) vs shared helper → Accepted: matches advisor plan; keeps diff localized

## Migration Plan

N/A — internal implementation optimization. Deploy via normal connector bundle update. No data migration, config changes, or operator action required.

**Rollback:** Revert changes in `formProcessor.ts`.

## Open Questions

- None blocking implementation.
