## Context

Fusion accounts are serialized to ISC via `FusionService.getISCAccount`, which calls `SchemaService.getFusionAttributeSubset` to produce the platform-facing attribute bag. The subsetter iterates all schema-defined attribute names (~15 base + mapped attrs), casts each value to schema type, and currently assigns every key — including explicit `null`.

Internal attribute bags (mapping, merge, collections) retain nulls for intermediate logic. Only the platform output subset changes.

Dry-run POC (18,875 accounts): output phase 949 ms total; in-loop null skip adds ~0 ms overhead.

## Goals / Non-Goals

**Goals:**
- Omit `null` and `undefined` keys from ISC account attribute output
- Implement in a single pass inside `getFusionAttributeSubset`
- Preserve empty arrays and non-null scalar values unchanged
- Cover with unit tests and spec delta

**Non-Goals:**
- Filtering empty strings, whitespace-only strings, or empty arrays
- Config toggle for omit-vs-null behavior
- Changing internal FusionAccount attribute bag storage
- Platform-side null-clearing semantics for accountUpdate (connector rebuilds from sources)

## Decisions

### D1: Filter location

- **Choice:** Skip assignment inside `getFusionAttributeSubset` when input or cast result is nullish
- **Reason:** Already iterates every schema attribute; zero extra pass; may skip cast work on null inputs
- **Considered alternatives:** Post-filter in `getISCAccount` (extra iteration); SDK send layer (wrong abstraction)

### D2: What counts as "omit"

- **Choice:** Omit when cast output is strictly `null` or `undefined`
- **Reason:** Distinct from empty array `[]` (valid multi-valued "no items" state for entitlements like reviews)
- **Considered alternatives:** Also omit empty strings/arrays — rejected; different semantics for entitlements and required attrs

### D3: No configuration flag

- **Choice:** Always omit nullish keys at output
- **Reason:** YAGNI; mapping tests already assume output-stage filtering; no customer request for explicit null emission
- **Considered alternatives:** Developer setting — rejected as unnecessary complexity

## Risks / Trade-offs

- [Risk] Consumers expecting explicit null keys in output → Mitigation: Document in spec; internal bags unchanged; only platform subset affected
- [Risk] accountUpdate semantic confusion (omit vs clear) → Mitigation: accountUpdate rebuilds full state from sources before serialize; omitted null = no source value, not "preserve platform"
- [Trade-off] Output shape no longer mirrors full schema key set → Accepted: sparse output is the goal

## Migration Plan

N/A — connector code change only. No deployment sequence, config migration, or rollback beyond reverting the commit. Acceptance: unit tests pass; dry-run output accounts have fewer keys with no `"key": null` entries for unmapped attrs.

## Open Questions

None — scope and semantics resolved in brainstorm.
