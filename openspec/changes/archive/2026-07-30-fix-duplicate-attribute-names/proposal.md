## Why

ISC treats account schema attribute names as case-insensitive. When the connector merges managed-source and identity attributes during schema discovery, the same logical attribute can appear with different casing (e.g. `FirstName` and `firstname`). Payloads containing both variants are rejected by the platform API, blocking schema discovery and source configuration. This happens in deployments where identity attributes use PascalCase and managed sources use lowercase — a common pattern.

## What Changes

**Schema attribute deduplication**
- From: On case-insensitive name collision, the later attribute's metadata overwrites the first (only casing is preserved from the first).
- To: On collision, the first attribute encountered in merge order is kept entirely; later variants are dropped.
- Reason: ISC accepts only one variant per logical attribute name.
- Impact: Non-breaking for correctly deduped schemas; fixes API rejection for affected tenants.

**Schema ingestion hardening**
- From: `setFusionAccountSchema` builds internal lookup maps with case-sensitive keys, allowing duplicate casings from an input schema to propagate.
- To: Input schema attributes are deduplicated case-insensitively (first wins) before building internal maps.
- Reason: Prevents duplicate keys in platform account output when ISC passes a schema with existing collisions.
- Impact: Non-breaking; defensive fix for runtime paths.

**Observability**
- From: Duplicate attribute collisions are silent.
- To: Skipped duplicates are logged at debug level with both casings.

## Capabilities

### New Capabilities

_(none — behavior extends existing schema service)_

### Modified Capabilities

- `schema-service`: Add requirement that schema attribute lists MUST be deduplicated case-insensitively, keeping the first encountered variant.
- `account-discover-schema-operation`: Add requirement that discovered schema output MUST NOT contain case-insensitive duplicate attribute names.

## Impact

- **Code:** `src/services/schemaService/schemaService.ts`, `src/services/schemaService/helpers.ts`, tests in `src/services/schemaService/__tests__/`
- **Operations:** `accountDiscoverSchema` output becomes API-safe for mixed-casing attribute sources
- **Docs:** Troubleshooting note for schema discovery collisions (optional, low priority)
- **Dependencies:** None
