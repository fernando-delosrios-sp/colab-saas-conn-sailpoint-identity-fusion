## Context

The connector already marks managed-origin Fusion accounts as `orphan` when they lose all managed source accounts. The `deleteEmpty` setting then filters those orphans from aggregation output, causing ISC to delete them. Identity-origin Fusion accounts (created from `Identities` source documents) are currently protected from this behavior because `addManagedAccountLayer` skips orphan assignment for any account with the `baseline` status.

The identity scope (configured via `includeIdentities` and `identityScopeQuery`) determines which ISC identities are considered valid anchors for Fusion processing. When an identity-origin Fusion account's origin identity is removed from that scope — or the identity is deleted — the account has no remaining anchor and should be treated the same way as a managed-origin account with no source accounts.

## Goals / Non-Goals

**Goals:**
- Allow identity-origin Fusion accounts to be marked `orphan` when their origin identity is absent from the configured identity scope and no managed source accounts remain.
- Preserve existing `baseline` status on identity-origin orphan accounts.
- Apply the rule consistently across full aggregations and single-account operations (read, update, enable, disable).
- Use a targeted search for single-account operations to avoid loading the full identity population.
- Preserve existing managed-origin orphan behavior exactly.

**Non-Goals:**
- Changing how `deleteEmpty` filters orphans in the output layer.
- Removing or redefining the `baseline` status.
- Affecting record/orphan source-type policies or Match workflows.
- Introducing composite ID formats for identity origins.

## Decisions

### 1. Detect identity-origin by `originSource`, not by composite IDs
Identity-origin accounts already set `originSource = 'Identities'` and `originAccount = identity.id` in `FusionAccount.fromIdentity()`. Persisted accounts restore these fields in `fromFusionAccount()`. This avoids introducing a new ID convention and reuses existing schema attributes.

### 2. Track scope membership separately from general identity cache
`IdentityService.fetchIdentities()` loads exactly the configured scope. Single-account rebuilds call `fetchIdentityById()`, which must remain available for hydration but should not affect the scope decision. Therefore a dedicated `identityIdsInScope` set is populated only by `fetchIdentities()`, and `hasIdentityInScope()` checks that set.

### 3. Targeted scope check for single-account operations
Calling `fetchIdentities()` during a single-account rebuild could be expensive for large scopes. Instead, `IdentityService.isIdentityInScope(id)` performs a single search with `id:"<id>"` combined with the configured scope query. If `includeIdentities` is false or no scope query is defined, the result follows the same semantics as `fetchIdentities()`.

### 4. Keep `baseline` when adding `orphan`
The `baseline` entitlement indicates the account originated from a pre-existing identity. Removing it would lose audit context. The new status is additive: an identity-origin orphan carries both `baseline` and `orphan`.

### 5. Orphan assignment stays in `FusionAccount.addManagedAccountLayer`
The model already owns the rule "no managed accounts means orphan." Extending that rule to consider the origin identity keeps the decision close to the data it depends on. Callers supply the precomputed scope flag.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Legacy identity-origin accounts without `originAccount` set would not be detected. | Fall back to `identityId` when `originAccount` is missing. |
| Single-account operations now perform an extra scoped search. | The search is targeted by `id` and only runs when the rebuilt account is identity-origin. |
| Empty `identityScopeQuery` with `includeIdentities=true` loads no identities; all identity-origin accounts with no managed accounts become orphan. | This matches the semantics that the configured scope is the source of truth. |
| `deleteEmpty` filtering is reused without change; if a bug exists there it affects both account types. | No change to output filtering; existing behavior is preserved. |

## Migration Plan

No migration steps are required. The change is behavior-only and applies on the next aggregation or single-account operation. Customers who already enable `deleteEmpty` will see identity-origin orphan accounts removed automatically. Customers who do not enable `deleteEmpty` will only see the new `orphan` status on affected accounts.

## Open Questions

None.
