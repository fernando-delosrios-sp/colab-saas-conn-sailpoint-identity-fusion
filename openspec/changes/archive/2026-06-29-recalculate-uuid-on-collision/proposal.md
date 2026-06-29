## Why

Currently, when a unique attribute definition uses the `$UUID` macro and the generated value collides with an existing account's attribute, the connector resolves the collision by appending a counter (falling back to `$counter` logic). This creates values that are a mix of a UUID and a counter, which can be undesirable when strict UUID formatting is required. To preserve the pure UUID format, the connector should instead generate a completely new UUID when a collision occurs for an expression that uses `$UUID`.

## What Changes

- Modify the unique attribute generation logic to recalculate a new UUID when a collision is detected for an expression utilizing `$UUID`.
- **BREAKING**: When a collision occurs for an expression generating a `$UUID`, the connector will generate a completely new UUID instead of falling back to the standard counter-based disambiguation.
- Update documentation and related specs to reflect the new behavior of `$UUID` collision resolution.

## Capabilities

### New Capabilities
- `uuid-collision-recalculation`: Recalculate `$UUID` on collision instead of using `$counter`.

### Modified Capabilities
- `attribute-definition-documentation`: Update the documentation requirements to describe the new collision resolution behavior for `$UUID`.

## Impact

- The core attribute generation logic (likely in `src/services/fusionService/fusionService.ts` or related attribute generation helpers) will be updated to handle this recalculation loop.
- `docs/guides/define.md` will be updated to document this new `$UUID` collision behavior.
- Minimal impact on existing configurations, as `$UUID` collisions are extremely rare, but this ensures correctness when they do occur.
