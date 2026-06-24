## Why

The Fusion connector currently conflates several related but distinct name concepts:
- `FusionAccount.name` / `displayName` (source title)
- `_identityInfo.name` (alias/login)
- `_identityInfo.displayName` (human-readable display label)
- `fusionDisplayAttribute` (schema-driven display attribute)
- `fusionIdentityAttribute` (schema-driven identity attribute)

This leads to inconsistent report labels, unexpected display-attribute mutations, and fragile fallback logic. We need a clear, source-dependent resolution model with strict immutability for the schema-level identity and display attributes.

## What Changes

1. **Clarify `IdentityInfo`**
   - `id` is mandatory and non-empty.
   - `name` is the alias/login chain: `identity.name || account.identity?.name || decision.identityName`.
   - `displayName` is the human-readable chain: `identity.attributes.displayName || identity.name || account.identity?.name || account.name`.

2. **Clarify `FusionAccount.name`**
   - `account.name` when the source is an `Account`.
   - `identity.name` when the source is an `IdentityDocument`.
   - `displayName` remains an alias for `name`.

3. **Simplify report labels**
   - `getFusionReportAccountLabel` uses the display-label chain first, then alias, then source title, then managed-account/identity id.

4. **Make schema attributes immutable**
   - `fusionDisplayAttribute` never changes once set for previous Fusion accounts.
   - `fusionIdentityAttribute` never changes once set for any account.
   - New accounts still resolve their initial value from mapping/definition rules.

5. **UUID fallback for `fusionIdentityAttribute`**
   - When no definition produces a value and `skipAccountsWithMissingId` is false, generate a UUID.

6. **Treat identity decisions as uncorrelated managed**
   - Identity decisions use mapping/definition config for `fusionDisplayAttribute`, not the identity-linked override.

## Capabilities

### Modified Capabilities
- `fusion-account-attribute-resolution`: update attribute resolution rules for identity/display attributes and report label fallback behavior.

## Impact

- `src/model/fusionAccountTypes.ts`
- `src/model/fusionAccount.ts`
- `src/services/fusionService/helpers.ts`
- `src/services/fusionService/fusionService.ts`
- `src/services/attributeService/attributeService.ts`
- `src/services/formService/formBuilder.ts`
- Related test files
