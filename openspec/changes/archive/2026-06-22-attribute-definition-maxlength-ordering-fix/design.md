## Context

Attribute definitions support a `maxLength` option that caps the length of the generated value. The pipeline for producing a final value from a Velocity expression is:

1. Render Velocity template → raw string
2. Apply post-processing: `trim` → `case` → `spaces` → `normalize`
3. Enforce `maxLength`

Currently `maxLength` truncation is applied **inside** `evaluateVelocityTemplate` (step 1), before any post-processing. The `trim` option, which strips leading/trailing whitespace, runs in step 2 — after truncation. This means a value padded with whitespace gets truncated to `maxLength` (inclusive of whitespace), then trimmed to something shorter than `maxLength`.

A second sub-problem exists for Unique attributes: when a `$counter` suffix is present, the `truncateResultToMaxLength` helper already attempts to preserve the counter inside `maxLength`. However, because this logic lives inside the renderer rather than the final post-processing step, it is bypassed if the counter is added to the expression by the collision-disambiguation auto-append (`$counter` auto-suffix) and the template is evaluated at the Velocity level with no counter in context on the first attempt.

Affected code paths:
- `src/services/attributeService/formatting.ts` – `evaluateVelocityTemplate` / `truncateResultToMaxLength`
- `src/services/attributeService/attributeService.ts` – `evaluateTemplate` and `applyUniqueValueOutputTransforms`
- `openspec/specs/attribute-definition-documentation/spec.md` – requirement on `maxLength` behaviour

## Goals / Non-Goals

**Goals:**
- `maxLength` is enforced after the full post-processing pipeline so the final value length is exactly `≤ maxLength`, never shorter due to whitespace trimming.
- The counter-aware truncation (`truncateResultToMaxLength`) is relocated to the post-processing step; counter length is reserved from the `maxLength` budget before any prefix/suffix trimming.
- The `$isUnique` helper path (`applyUniqueValueOutputTransforms`) matches the production path: same ordering of transforms, same `maxLength`-last guarantee.
- Existing tests are updated; regression tests are added.

**Non-Goals:**
- Changes to any other definition options (e.g. `removeSpaces`, `normalize` ordering relative to each other).
- Changes to how `$counter` value is computed or padded.
- UI/connector-spec changes (no user-facing option names change).

## Decisions

### D1: Remove `maxLength` from `evaluateVelocityTemplate`

**Decision**: Strip the `maxLength` parameter from `evaluateVelocityTemplate` and its caller site in `evaluateTemplate`. Truncation moves entirely to the caller after post-processing.

**Rationale**: The Velocity renderer's job is to produce a raw string from the template. Applying business-level constraints (maxLength) there intermingles rendering with post-processing, making the ordering hard to reason about. Moving it to the caller makes the pipeline explicit.

**Alternatives considered**: Keep the parameter but add a second truncation pass after post-processing. Rejected because it would mean truncation happens twice (once in the renderer, once after), with the first pass being redundant dead code and potentially confusing.

### D2: Counter-aware truncation moves to `evaluateTemplate` / `applyUniqueValueOutputTransforms`

**Decision**: Export `truncateResultToMaxLength` from `formatting.ts` (or expose a simpler variant) and call it at the end of the post-processing block in both `evaluateTemplate` and `applyUniqueValueOutputTransforms`, after trim/case/spaces/normalize.

**Rationale**: Counter context is available in both call sites. Keeping the smart truncation logic in `formatting.ts` (just making it exportable) avoids duplication.

**Alternatives considered**: Inline simple `substring(0, maxLength)` in both call sites without counter-awareness. Rejected because that would regress counter preservation for Unique attributes.

### D3: No change to post-processing order for other transforms

**Decision**: `trim → case → spaces → normalize → maxLength` is the canonical order. No other reordering.

**Rationale**: The user's request is explicit: `maxLength` should be last. The existing relative order of the other transforms is not part of this bug report and has pre-existing test coverage.

## Risks / Trade-offs

- **Behaviour change for existing users**: values that were previously truncated-then-trimmed will now be trimmed-then-truncated, meaning they can be up to a few characters longer than before. This is the correct behaviour but represents a change from the previously buggy output.
  → Mitigation: document in CHANGELOG under a bug-fix entry; no migration required since the old values were shorter than intended.

- **`applyUniqueValueOutputTransforms` divergence risk**: if `evaluateTemplate` is changed but `applyUniqueValueOutputTransforms` is not updated identically, `$isUnique` will test a different candidate than what the production path produces, causing false positives/negatives.
  → Mitigation: both functions share the same ordering; a unit test asserts they produce the same output for the same input.

## Migration Plan

No data migration required. This is a runtime fix: new accounts generated after deployment will have values up to `maxLength` characters. Existing stored values are not affected (unique attribute values are only regenerated on reset).

## Open Questions

None.
