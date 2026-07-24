## Why

`fusionDisplayAttribute` and `fusionIdentityAttribute` are special schema attributes in Fusion. They are not fixed names; they point to whatever attributes the account schema defines as `displayAttribute` and `identityAttribute`. These attributes must always be present on every Fusion account.

Currently the connector provides fallbacks, but the guarantee is incomplete:
- `fusionIdentityAttribute` can be deleted when neither `originAccountId` nor the persisted `originAccount` attribute is available.
- Identity-origin accounts only explicitly set `fusionDisplayAttribute`; `fusionIdentityAttribute` relies on indirect fallbacks.
- Correlated managed accounts fall back to the original managed account name for `fusionDisplayAttribute` instead of the associated identity's name.

This change closes those gaps so the two attributes are always populated according to the rules described below.

## What Changes

1. **UUID fallback for `fusionIdentityAttribute`** — when no origin-based value is available, generate a fresh v4 UUID instead of deleting the attribute.
2. **Explicit identity attribute assignment** — in `processIdentity()`, set `fusionIdentityAttribute = identity.id` alongside the existing display-attribute assignment.
3. **Identity name for correlated accounts** — broaden the display-attribute identity-name rule from `fromIdentity` only to any identity-linked account (`isIdentity`).

## Capabilities

### Modified Capabilities
- `fusion-account-attribute-resolution`: Change how the identity/display attributes are defaulted when definitions do not produce a value.

## Impact

- `src/services/attributeService/attributeService.ts`
- `src/services/fusionService/fusionService.ts`
- Related unit tests in `src/services/attributeService/__tests__`, `src/services/fusionService/__tests__`, and `src/operations/__tests__`.
