## Context

`src/data/schema.ts` declares the connector's default Fusion account schema as `fusionAccountSchemaAttributes: SchemaAttribute[]` with twelve entries. The string `name` of each entry is then hand-typed in roughly thirty call sites that read, write, or otherwise reference those attributes on a `FusionAccount` or in the dynamic schema builder. There is no shared vocabulary, so the compiler cannot help if a developer mistypes `'missing-accounts'` as `'missingAccounts'`, `'mainAccount'` as `'main-account'`, or `'originSource'` as `'origin_source'`. The same pattern produced the `StatusEntitlement` enum in the `2026-06-30-create-status-entitlements-enum` change; the schema attribute names deserve the same treatment.

`name` and `id` are deliberately excluded. They are SDK structural keys (the schema's `identityAttribute` and `displayAttribute` defaults) as well as schema attribute names, and the few places they appear as schema defaults are already structurally adjacent to other `displayAttribute` / `identityAttribute` literals (e.g. `buildDynamicSchema` in `src/services/schemaService/schemaService.ts:374-376` sets `displayAttribute: 'name'`, `identityAttribute: 'id'`, `groupAttribute: 'actions'`). Wrapping them in the enum would conflate "schema attribute name" with "SDK structural key" and pull more code into the change than necessary.

## Goals / Non-Goals

**Goals:**

- Provide one TypeScript `enum FusionAttribute` whose string values are exactly the `name` of every entry in `fusionAccountSchemaAttributes` except `name` and `id`.
- Replace default-attribute-name string literals at every internal call site the connector owns (production + tests) with the matching `FusionAttribute` member.
- Remove the three private `const` aliases in `src/services/attributeService/attributeService.ts` and inline the enum members at their use sites.
- Keep the public `FusionAccount` API string-typed so persisted payloads and external callers stay compatible.
- Add a contract test that locks the enum↔schema-array relationship.

**Non-Goals:**

- Adding new default attributes. The enum types the existing set only.
- Changing the serialized shape of any default attribute on the fusion account.
- Tightening any public `FusionAccount` method to accept only the enum (that is a future, breaking change for any external caller).
- Renaming the schema array or any attribute name.
- Including `name` and `id` in the enum (see Context).
- Deriving the enum at runtime from `fusionAccountSchemaAttributes` — the array is small, stable, and casing mismatch (`missing-accounts` ↔ `MissingAccounts`) makes derivation more trouble than it is worth.

## Decisions

### Decision 1: Plain `enum` (string-valued), not `const enum` or string-literal union

A regular `enum` is the existing convention (`FusionAccountKind`, `StatusEntitlement`, `AttributeMergeMode`, `SourceType`, etc.) and gives us:

- Named members usable at the call site (`FusionAttribute.MissingAccounts`).
- Runtime iteration (helpful in tests and for cross-checking against the schema array).
- A single string-valued definition (`MissingAccounts = 'missing-accounts'`) so the runtime value matches the persisted name.

`const enum` is rejected because the connector is bundled with `ncc` and `const enum` inlining can interact poorly with bundler output. A string-literal union type is rejected because it produces no runtime value the contract test can iterate over.

### Decision 2: File location `src/data/schema.ts`, name `FusionAttribute`

The enum is co-located with the source-of-truth `fusionAccountSchemaAttributes` array so a developer reading the schema definition immediately sees the typed vocabulary. The two form a single contract and live in one file. The name `FusionAttribute` mirrors `FusionAccountKind` and `FusionDecision` in the model layer and is unambiguous.

### Decision 3: `FusionAttribute` excludes `name` and `id`

`name` and `id` are excluded from the enum. Reasons:

1. They double as the schema's `identityAttribute` / `displayAttribute` defaults; wrapping them in the enum would mean `groupAttribute: 'name'` instead of `groupAttribute: 'actions'`, which confuses intent.
2. The `name` and `id` keys appear in SDK structural positions (e.g. `account.name`, `account.id`, `key.simple.id`) far more often than as schema attribute names; putting them in the enum invites misuse.
3. The two are the schema's `required: true` identity keys — their handling is special-cased throughout `FusionAccount.fromFusionAccount` and `SchemaService.setFusionAccountSchema`. Treating them like the other ten attributes would be misleading.

### Decision 4: One member per default attribute, exact string match

Each enum member's string value is the existing schema `name` verbatim:

```ts
export enum FusionAttribute {
    History = 'history',
    Statuses = 'statuses',
    Actions = 'actions',
    Accounts = 'accounts',
    MissingAccounts = 'missing-accounts',
    Reviews = 'reviews',
    Sources = 'sources',
    MainAccount = 'mainAccount',
    OriginSource = 'originSource',
    OriginAccount = 'originAccount',
}
```

No new names are introduced; no existing names change. The serialized format is bit-identical.

### Decision 5: Hardcode the enum in parallel with the schema array

The enum is a hand-maintained parallel list to `fusionAccountSchemaAttributes`, not derived from it. Reasons:

1. The array is small (10 relevant entries) and changes only when a default attribute is added or renamed — events that are themselves spec-level changes.
2. Derivation requires either a build-time codegen step (overkill) or a runtime mapping function that translates the schema `name` to a `PascalCase` enum key, which adds friction (`'missing-accounts'` → `MissingAccounts` vs `'mainAccount'` → `MainAccount`).
3. A contract test (Decision 7) catches drift, removing the main risk of a parallel list.

### Decision 6: Replace literals at every call site we own

Every internal reference to a default attribute name in:

- `src/model/fusionAccount.ts`
- `src/model/fusionAccountUtils.ts`
- `src/operations/helpers/rebuildFusionAccount.ts`
- `src/operations/helpers/buildDryRunPayload.ts`
- `src/operations/helpers/dryRunHelpers.ts`
- `src/services/attributeService/attributeService.ts` (and remove the three `const` aliases)
- `src/services/schemaService/schemaService.ts` (the `groupAttribute: 'actions'` literal)

…is replaced with the matching `FusionAttribute.*` member. This includes:

- `attributeToSet(attributes, 'history')` → `attributeToSet(attributes, FusionAttribute.History)`
- `attributes['missing-accounts']` → `attributes[FusionAttribute.MissingAccounts]`
- `attributes.statuses` (dot access) → `attributes[FusionAttribute.Statuses]` (must switch to bracket access for runtime semantics)
- `readPathString(a, ['attributes', 'originAccount'])` → `readPathString(a, ['attributes', FusionAttribute.OriginAccount])` (only the value element changes; the path prefix `'attributes'` stays)
- `groupAttribute: 'actions'` in `buildDynamicSchema` → `groupAttribute: FusionAttribute.Actions`

Test fixtures that simulate persisted data (`accounts: ['src-a::user-1']`, `missing-accounts: ['src-a::missing-1']`, etc.) are left as raw strings — they represent deserialized payloads, not production code writing new attributes.

### Decision 7: Lock the enum↔schema contract with a unit test

A new test file `src/data/__tests__/schema.test.ts` asserts:

1. Every `FusionAttribute` string value is the `name` of some entry in `fusionAccountSchemaAttributes`.
2. The enum has exactly ten members (the current count, after excluding `name` and `id`).
3. The enum never overlaps with `name` and `id` (it does not contain `'name'` or `'id'`).

The first assertion catches drift; the second catches accidental additions or removals; the third documents the deliberate exclusion.

### Decision 8: Public `FusionAccount` API stays string-typed

Persisted fusion accounts round-trip attribute values as `string[]` in the SDK attribute bag. Tightening `addMissingAccountId`, `addReview`, `addSource`, `addStatus`, `addAction`, `addAccountId`, `setReverseCorrelationAttribute`, `setUncorrelatedAccount`, or any similar setter to accept only the enum would break loading accounts whose values were persisted with strings that don't match a current enum member (e.g. an older connector that wrote a now-renamed attribute). The enum is the *internal* vocabulary; the boundary stays string-typed.

## Risks / Trade-offs

- **[Risk] Drift between enum and `fusionAccountSchemaAttributes` if someone adds a default attribute in only one place.** → Mitigation: the contract test in `src/data/__tests__/schema.test.ts` asserts the enum values are a subset of the schema names. The test runs in `npm test`.
- **[Risk] Bundle size from the enum is negligible but non-zero.** → Mitigation: the enum is 10 string members; impact is well under 1 KB after `ncc`.
- **[Risk] `name` and `id` exclusion could surprise a future maintainer who expects "every schema attribute is in the enum".** → Mitigation: the exclusion is documented in Decision 3, in the JSDoc above the enum, and asserted explicitly by the contract test.
- **[Trade-off] The `displayAttribute: 'name'` and `identityAttribute: 'id'` literals in `buildDynamicSchema` and elsewhere remain as raw strings.** → Accepted: those are SDK structural keys, not schema attribute references, and pulling them in would expand scope without benefit.
- **[Trade-off] Test fixture strings stay as raw strings.** → Accepted: a test that builds `accounts: ['src-a::user-1']` is simulating a payload from storage, not exercising the production write path. Forcing enum members into every test fixture would hurt readability without changing what the test verifies.

## Migration Plan

This is an internal refactor; no data migration. The change is shipped in one PR with `npm run lint` and `npm test` green. Rollback is `git revert` of the single commit — persisted attribute values use the same string literals, so older and newer connector versions can read each other's data.

## Open Questions

None. The enum shape, location, member set, and exclusion policy are all settled by Decisions 1–8.
