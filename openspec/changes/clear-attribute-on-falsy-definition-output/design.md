## Context

Normal attribute definitions run during Map+Define processing when `refreshNormalAttributes` executes. Today, `processNormalDefinition` writes a new value only when `evaluateAttributeTemplate` returns a non-nullish result. The falsy and error branches call `fusionAttributeSafeDefault` for core schema attributes but otherwise **do nothing**, leaving prior persisted values in `attributeBag.current`.

The user requires the opposite: when a definition **runs** and fails or produces falsy output, the attribute must be **cleared** from the bag. Unique attributes already follow this pattern during regeneration (`delete fusionAccount.attributes[name]`). Static, immutable identity/display, and skip-when-static guards remain unchanged.

## Goals / Non-Goals

**Goals:**
- Clear normal attribute values from the attribute bag when template evaluation returns falsy (`undefined`/`null`) after a definition executes
- Clear normal attribute values when template evaluation returns an error, subject to the same core-schema safe-default rules
- Remove cleared keys from the Velocity evaluation context for downstream definitions in the same pass
- Preserve existing core-schema guarantee (`fusionIdentityAttribute`, `fusionDisplayAttribute` never empty)
- Add regression tests and update operator-facing documentation

**Non-Goals:**
- Changing unique attribute generation semantics (already clears on falsy)
- Adding a configuration toggle to restore preserve-on-empty behavior
- Changing static-definition skip logic or immutable identity/display guards
- Changing mapping-service merge behavior
- Modifying Velocity helper empty-string contract (`''` → `undefined` at template layer stays)

## Decisions

### D1: Clear by deleting the attribute key
- **Choice**: `delete fusionAccount.attributes[definition.name]` and `delete context[definition.name]` when falsy/error and no safe default applies
- **Reason**: Matches unique-attribute clearing; platform output omits absent keys (existing schema-service nullish omission)
- **Considered alternatives**: Write explicit `null` (rejected — internal bags use deletion; output stage already omits nullish keys)

### D2: Falsy sentinel aligned with existing template pipeline
- **Choice**: Trigger clearing when `result.value === undefined || result.value === null` OR `result.error` is set — same conditions as today's branch, inverted action
- **Reason**: Reuses `evaluateAttributeTemplate` and `evaluateVelocityTemplate` contracts without changing template evaluation
- **Considered alternatives**: Separate "empty string only" trigger (rejected — user said falsy; pipeline already normalizes empty to undefined)

### D3: Core schema safe defaults override clearing
- **Choice**: When falsy/error and attribute is `fusionIdentityAttribute` or `fusionDisplayAttribute`, apply `fusionAttributeSafeDefault` if non-undefined (same as today)
- **Reason**: Existing requirement "core schema attributes are never empty" must hold
- **Considered alternatives**: Allow core attrs to clear (rejected — breaks identity linkage and platform contract)

### D4: Guards that skip evaluation are unchanged
- **Choice**: No change to static skip, immutable identity/display skip, or unique-name early return in normal path
- **Reason**: User request targets the outcome when evaluation **runs**, not when it is skipped
- **Considered alternatives**: Force static attrs to re-evaluate on refresh (out of scope)

### D5: Error and falsy paths share clearing logic
- **Choice**: Extract or duplicate minimal clear-or-safe-default logic for both `result.error` and falsy value branches in `processNormalDefinition`
- **Reason**: User explicitly included "calculation fails" alongside falsy output
- **Considered alternatives**: Clear only on falsy, log-and-preserve on error (rejected — inconsistent with user request)

## Risks / Trade-offs

- [Risk] Transient missing source fields clear previously valid computed attributes on every aggregation → Mitigation: Document `$previous` fallback pattern in velocity-context and defining-attributes guides; Static for write-once values
- [Risk] Breaking change for tenants depending on preserve-on-empty → Mitigation: Changelog entry; note in defining-attributes behavior table
- [Trade-off] Numeric `0` or boolean `false` from templates are treated as falsy by `evaluateAttributeTemplate` (`if (!value)`) and would clear → Accepted: Velocity renders strings; existing pipeline already coerces falsy before Define write; document if needed

## Migration Plan

1. Deploy connector update; no ISC config migration required.
2. On first aggregation after upgrade, normal attributes whose definitions now evaluate falsy will be cleared from persisted fusion accounts.
3. Operators who need retention when new input is missing should update Velocity expressions to use `$previous` or mark attributes Static.
4. Rollback: revert connector version; next aggregation restores prior preserve-on-empty behavior (cleared values are not automatically restored — may require re-aggregation from source or account reset).

## Open Questions

None.
