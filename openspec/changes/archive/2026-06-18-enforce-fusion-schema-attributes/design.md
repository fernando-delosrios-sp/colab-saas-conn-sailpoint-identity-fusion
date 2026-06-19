## Context

The Fusion connector resolves account attributes through attribute mappings, normal definitions, and unique definitions. Two attributes are special because the schema itself points to them via `displayAttribute` and `identityAttribute`:

- `fusionDisplayAttribute` — the human-readable label for the Fusion account.
- `fusionIdentityAttribute` — the stable unique identifier for the Fusion account.

Today these attributes are handled in `attributeService.ts` via `fusionAttributeSafeDefault()` and in `fusionService.ts` when an account is created from an identity. The existing fallbacks work for the common cases but leave three edge cases unprotected.

## Goals / Non-Goals

**Goals:**
- Guarantee `fusionDisplayAttribute` is always present.
- Guarantee `fusionIdentityAttribute` is always present.
- Use the identity name for the display attribute when the account is associated with an identity (identity-created or correlated).
- Use a stable UUID for the identity attribute when no origin-based value exists.

**Non-Goals:**
- Changing the schema definitions in `connector-spec.json` or `schemaService.ts`.
- Changing attribute mapping or definition evaluation logic.
- Introducing new dependencies.

## Decisions

1. **UUID generation as ultimate identity-attribute fallback.** `uuidv4()` is already imported in `attributeService.ts` for the `$UUID` unique-attribute pipeline. Reusing it as the final fallback keeps the implementation minimal and consistent.
2. **`identity.id` for identity-origin accounts.** `identity.id` is the platform-stable identifier, distinct from `identity.name` or `identity.attributes.displayName`. Setting it explicitly removes reliance on the indirect `originAccountId` chain.
3. **`isIdentity` instead of `fromIdentity` for display-name rule.** `fromIdentity` is only true for accounts whose origin source is "Identities". `isIdentity` is true for any account with an `identityId`, covering both identity-origin and correlated managed accounts. The `hostingIdentityName()` helper is refined so identity-origin accounts keep their existing precedence (`fusionAccount.name` first, which is already `identity.name`), while correlated managed accounts prefer the identity display name / identity bag name over the original managed account name.

## Risks / Trade-offs

- **Risk:** Existing tests assert attribute deletion behavior for empty identity/display definitions. Those tests will need to be updated.
- **Risk:** A UUID fallback means the identity attribute of an uncorrelated account without an origin value will change on every aggregation if the attribute is regenerated. However, the same already happens for user-defined `$UUID` unique attributes, and the `needsReset` / immutability guards prevent regeneration for existing accounts.
- **Trade-off:** Using `isIdentity` means correlated managed accounts will switch from their original managed-account name to the identity name for the display attribute. This matches the requested behavior.

## Migration Plan

No migration needed. The change applies to in-flight account processing. Existing persisted Fusion accounts keep their attributes unless `needsReset` or `refreshDefinition` triggers regeneration, in which case the new fallbacks apply.

## Open Questions

None.
