## Why

Currently, normal attributes are recalculated whenever new source data is found, even if the "Refresh on each aggregation?" toggle is disabled. This makes it impossible to define an attribute value that is set once and never changes, regardless of future source data updates. By introducing a "Static" option, we allow users to define attributes that are calculated only when missing and kept forever thereafter, unless explicitly reset. This provides greater control over attribute lifecycle and stability for identity-linked properties.

## What Changes

**Normal Attribute Recalculation Behavior**
- From: A disabled `refresh` toggle still permits recalculation when `fusionAccount.needsRefresh` is true (due to source data changes).
- To: A new `static` toggle ensures that if a value exists, recalculation is skipped entirely, ignoring `fusionAccount.needsRefresh`. It is mutually exclusive with the `refresh` toggle.
- Reason: To allow attributes to be completely immutable once initially set, while still permitting manual resets.
- Impact: Non-breaking. The behavior only applies to attributes explicitly configured as static.

## Capabilities

### New Capabilities

### Modified Capabilities
- `attributeService`: The core attribute evaluation logic is updated to honor the static flag, and the configuration schema exposes a static option.

## Impact

Affects the schema definition (`connector-spec.json`), the type definitions (`NormalAttributeDefinition`), and the core pipeline logic in `attributeService.ts` (`processNormalDefinition`).
