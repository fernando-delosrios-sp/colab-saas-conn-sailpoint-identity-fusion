## Context

The Fusion connector builds a Velocity context in `AttributeService.buildVelocityContext()`. That context starts from the current mapped attributes and then adds reference objects such as `$identity`, `$accounts`, `$account`, `$previous`, `$sources`, `$originSource`, and `$originAccount`.

For identity-based Fusion accounts (`originSource === 'Identities'`), the identity document is the authoritative source of the account's name. However, `FusionAccount.addIdentityLayer()` stores only `identity.attributes` in `attributeBag.identity`. The root-level `IdentityDocument.name` is captured separately in `FusionAccount.name`, but it is never injected into the Velocity context.

## Goals / Non-Goals

**Goals:**
- Make the identity name accessible as `$identity.name` for identity-based Fusion accounts.
- Make the identity name accessible as a fallback `$name` when no mapped attribute named `name` exists.
- Make `$account.name` resolve for identity-backed origin snapshots.
- Keep project documentation synchronized with the implemented behavior.

**Non-Goals:**
- Changing how `attributeBag.identity` is stored internally.
- Changing behavior for managed-origin Fusion accounts.
- Altering the precedence of mapped attributes in the Velocity context.

## Decisions

1. **Context-only fix.** We enrich the Velocity context in `AttributeService.buildVelocityContext()` rather than changing `FusionAccount.addIdentityLayer()`. This keeps `attributeBag.identity` semantically equal to `identity.attributes` and minimizes the blast radius.
2. **Scope with `fromIdentity`.** The `$name` fallback is applied only when `fusionAccount.fromIdentity` is true, i.e., when the account's origin source is `Identities`. This excludes managed-origin accounts.
3. **Mapped attribute precedence.** If the current attributes already contain a non-empty `name`, that mapped value wins for `$name`. The identity name is only a fallback.
4. **`$identity.name` always reflects root identity name.** Even when `identity.attributes.name` exists, `$identity.name` is set to `FusionAccount.name`, which is the root identity name for identity-based accounts.
5. **`$account.name` uses the display name.** For identity-backed snapshots, `$account.name` is set to the same display name used for `$account.schema.name`, preserving consistency with existing identity-backed account shaping.

## Risks / Trade-offs

- **Risk:** Configurations that intentionally rely on `$name` being undefined for identity-based accounts will now see the identity name. This is the requested behavior.
- **Risk:** Configurations with a mapped attribute named `name` will continue to see that mapped value for `$name`, so backward compatibility is preserved.
- **Trade-off:** `$account.name` is set to the display name (`schemaName`), not necessarily the raw root identity name. This matches `$account.schema.name` semantics.

## Migration Plan

No migration needed. The change applies during in-flight attribute evaluation.

## Open Questions

None.
