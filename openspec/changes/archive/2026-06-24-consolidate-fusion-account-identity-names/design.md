## Context

The Fusion connector resolves account attributes through attribute mappings, normal definitions, unique definitions, and schema-level identity/display attributes. Today the boundary between the source title, the identity alias, and the identity display label is blurred:

- `FusionAccount.name` can derive from `account.name`, `account.identity.name`, or the identity display label depending on the source.
- `identityDisplayName` and `identityName` overlap and are used inconsistently in reports, forms, and attribute overrides.
- `fusionDisplayAttribute` and `fusionIdentityAttribute` are mutable for non-identity existing accounts and can drift from their persisted values.

## Goals / Non-Goals

**Goals:**
- Separate source title, identity alias, and identity display label into distinct, predictable fields.
- Make report labels prefer the human-readable display label while retaining solid fallbacks.
- Make `fusionDisplayAttribute` immutable for previous Fusion accounts.
- Make `fusionIdentityAttribute` immutable for all existing accounts once set.
- Use UUID as the final fallback for `fusionIdentityAttribute` when `skipAccountsWithMissingId` is false.
- Treat identity decisions as uncorrelated managed accounts for display-attribute resolution.

**Non-Goals:**
- Changing the Fusion account schema definitions.
- Changing the attribute mapping or definition evaluation logic itself.
- Supporting manual correction of immutable schema attributes.

## Decisions

1. **`IdentityInfo.id` is mandatory.** `isIdentity` returns true only when `_identityInfo.id` is non-empty. A name-only reference is not considered an identity linkage.

2. **`IdentityInfo.name` is the alias chain.** It resolves `identity.name || account.identity?.name || decision.identityName`. It may be empty if the identity has no name.

3. **`IdentityInfo.displayName` is the display-label chain.** It resolves `identity.attributes.displayName || identity.name || account.identity?.name || account.name`, giving a human-readable label in all identity-linked scenarios.

4. **`FusionAccount.name` is the source title.** `account.name` for Account sources; `identity.name` for IdentityDocument sources. `displayName` remains an alias.

5. **Report labels use the display-label chain first.** `getFusionReportAccountLabel` falls back through `identityDisplayName`, `identityName`, `name`, and finally `managedAccountId || identityId`.

6. **`fusionDisplayAttribute` rules by source:**
   - Previous Fusion: immutable (persisted value).
   - Identity-based: `identity.name`.
   - Correlated managed: `identity.name` (fetch identity if only `identityId` is available).
   - Uncorrelated managed / identity decisions: mapping/definition config only.

7. **`fusionIdentityAttribute` rules:** initial value from mapping/definition; UUID fallback when value is missing and `skipAccountsWithMissingId` is false; immutable once set.

## Risks / Trade-offs

- Report labels for identity-based accounts will show the display name when available, falling back to alias. This is more user-friendly but changes sort order and visible text compared to a pure-alias model.
- Absolute immutability means misconfigured or stale schema attributes can only be fixed by external intervention.
- Identity decisions that carry only `identityName` (no `identityId`) are no longer treated as identity-linked, which matches the desired uncorrelated-managed behavior.
