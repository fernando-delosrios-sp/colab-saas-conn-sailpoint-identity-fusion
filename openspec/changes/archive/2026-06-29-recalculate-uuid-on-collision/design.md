## Context

The Identity Fusion connector uses Apache Velocity to generate unique attributes. When a unique attribute expression is evaluated and the resulting value already exists, the connector resolves the collision. Currently, the default collision resolution mechanism auto-appends `$counter` to the expression if it does not explicitly contain `$counter` or `$UUID`. 

However, when an expression relies on `$UUID` to ensure uniqueness (e.g., just `$UUID` or `$firstname-$UUID`), the preferred behavior on a collision is not to append a counter (which would yield `$firstname-uuid1`, `$firstname-uuid11`, etc.), but rather to generate a completely new UUID on the next attempt.

## Goals / Non-Goals

**Goals:**
- Ensure that unique attribute definitions utilizing `$UUID` resolve collisions by recalculating a new UUID rather than relying on a counter-based fallback.
- Avoid auto-appending `$counter` to expressions that contain `$UUID`.
- Update the documentation to reflect this collision resolution behavior.

**Non-Goals:**
- Do not change the collision resolution behavior for expressions that do *not* contain `$UUID` (they will continue to use `$counter`).
- Do not remove the ability to explicitly use `$counter` if an administrator manually includes it in an expression alongside `$UUID`.

## Decisions

**Decision 1: Recalculate UUID on every collision attempt**
We will ensure that within the `generateWithCollisionDisambiguation` loop (and `generateWithIncrementalCounter`), a new v4 UUID is generated and injected into the Velocity context (`context.UUID = uuidv4()`) on *every* retry attempt if the expression contains `$UUID` or `${UUID}`. 
*Rationale:* This guarantees that the evaluated template will produce a different value on the next attempt purely by relying on the random nature of UUIDs, preserving the expected format of the attribute.

**Decision 2: Suppress `$counter` auto-append for `$UUID` expressions**
We will verify that `buildEffectiveExpression` suppresses the addition of `$counter` when the expression contains `$UUID`.
*Rationale:* Appending `$counter` would pollute the attribute value. Since UUIDs are practically globally unique, a collision is extremely rare but recalculating the UUID is the mathematically sound approach to resolve it without changing the output format.

## Risks / Trade-offs

- **[Risk] Multiple UUID Collisions:** Extremely improbable, but if a regenerated UUID collides repeatedly, it could exhaust `maxAttempts`.
  - *Mitigation:* `maxAttempts` bounds the loop to prevent infinite retries. The statistical likelihood of multiple v4 UUID collisions in a row is effectively zero.
- **[Risk] Existing configurations relying on `$UUID$counter`:** If any deployment relied on a counter being appended to a UUID on collision.
  - *Mitigation:* Document this as a breaking change in behavior (though practically, UUID collisions don't happen, so no real-world deployments rely on this fallback).
