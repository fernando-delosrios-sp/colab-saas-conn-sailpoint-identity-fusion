<!--
Raw capture of superpowers:brainstorming output.
-->

# Brainstorm: Clear normal attribute on falsy or failed definition output

## Background

Normal attribute definitions (`processNormalDefinition` in `definitionService.ts`) currently **preserve** the previously stored value when a Velocity template evaluates to empty/null or when evaluation fails. The `else` branch (lines 689–699) only applies `fusionAttributeSafeDefault` for core schema attributes (`id`, `name`) and otherwise leaves the attribute unchanged.

The user requests the opposite contract: **when calculation fails or returns a falsy value, the attribute MUST be cleared** (removed from the attribute bag), not kept.

Related prior art:
- Velocity helpers return `''` on failure → `evaluateVelocityTemplate` → `undefined` → currently no write (preserve).
- Unique attributes already `delete fusionAccount.attributes[name]` when generation returns null/undefined (unless safe default applies).
- Static definitions skip evaluation when a valid value exists — unchanged by this request.
- Immutable `id`/`name` on existing fusion rows skip definition overwrite — unchanged.

## Decision Chain

- **Q1:** Which attribute types are in scope?
  - **A1:** **Normal definitions only.** Unique attributes already clear on failed regeneration; static/immutable skip paths are separate guards.

- **Q2:** What counts as "falsy" for clearing?
  - **A2:** Same sentinel as today: `evaluateAttributeTemplate` returns `{ value: undefined }` for empty string, null, undefined, and JavaScript-falsy post-render values (`if (!value)` in `templateEvaluator.ts`). Clearing triggers when `result.value === undefined || result.value === null` OR `result.error` is set.

- **Q3:** Should core schema attributes (`fusionIdentityAttribute`, `fusionDisplayAttribute`) be cleared?
  - **A3:** **No.** Existing requirement "core schema attributes are never empty" remains. On falsy/error, apply `fusionAttributeSafeDefault` when available (UUID / account name / identity alias paths). Only non-core attributes are deleted from the bag.

- **Q4:** Should static definitions be affected?
  - **A4:** **No.** Static + existing value → skip evaluation entirely (current behavior). Clearing only applies when the definition **runs** and produces falsy/error.

- **Q5:** Should immutable display/identity guards on existing fusion accounts change?
  - **A5:** **No.** Early return before template evaluation stays.

- **Q6:** Clear vs explicit null in platform output?
  - **A6:** Clearing removes the key from `attributeBag.current`. Platform output already omits nullish keys via `SchemaService.getFusionAttributeSubset` — cleared attributes disappear from ISC payload (same as never having a value).

- **Q7:** Is this breaking?
  - **A7:** **Yes, behavior change.** Tenants relying on "preserve on transient missing source data" will see attributes cleared when templates fail. Document migration: use `$previous` in Velocity for explicit retention, or Static for one-time values.

## Agreed Approach

**Recommended:** Mirror unique-attribute clearing in `processNormalDefinition` for the falsy/error branch — `delete fusionAccount.attributes[name]` and `delete context[name]`, except when `fusionAttributeSafeDefault` returns a value for core schema attributes.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| A. Clear on falsy/error (chosen) | Explicit contract; stale values removed when source no longer supports computation; aligns with user request | Breaking; transient source gaps wipe values |
| B. Config toggle (preserve vs clear) | Backward compatible | YAGNI — user wants new default, not a flag |
| C. Clear only on error, preserve on empty | Softer migration | User explicitly included falsy values; inconsistent |

## Design Trade-offs

- `$previous` becomes the opt-in retention mechanism for templates that need fallback when new computation fails.
- Operators with date/format helpers depending on intermittently missing fields must fix templates or accept cleared attributes.
- Error path currently logs and may apply safe default only — will align with falsy path (clear or safe default).

## Open Questions

None — user request is explicit for normal definitions.
