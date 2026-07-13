## Why

The identity schema discovery process currently has several potential bugs:
1. Undefined names from identity attributes can result in a schema attribute named `"undefined"`.
2. Case collisions between account schemas and identity attributes are resolved by overwriting, which can change the casing of returned schema attributes and break mappings.
3. Unrecognized or custom identity attribute types can cause schema validation errors.
4. Failures during the identity attribute fetching API call are silently swallowed, potentially hiding critical API or configuration issues during discovery.

## What Changes

- **Modified**: Filter out identity attributes that have empty or undefined names to prevent `"undefined"` schema attributes.
- **Modified**: Implement case-insensitive comparison that preserves the original schema casing when mapping attributes during discovery, avoiding silent overwriting of correctly cased attributes.
- **Modified**: Map unknown or custom identity attribute types gracefully (defaulting to `"string"`) to prevent connector schema validation failures.
- **Modified**: Handle API errors during identity attribute fetching by logging them clearly and determining whether to fail the discovery run or fall back gracefully depending on the severity.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `schema-discovery`: Update schema discovery behavior to correctly handle identity attributes, casing deduplication, type mapping, and error propagation.

## Impact

- Affects `SchemaService` (`src/services/schemaService/schemaService.ts`) and its corresponding unit tests.
- Improves robustness of the connector schema discovery command (`stdAccountDiscoverSchema`).
