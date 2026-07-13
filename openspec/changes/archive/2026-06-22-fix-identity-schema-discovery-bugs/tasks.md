## 1. Implement Sanitization and Mapping in SchemaService

- [x] 1.1 Filter out identity attributes with missing or empty names in `fetchIdentitySchemaAttributes`
- [x] 1.2 Lowercase and map identity attribute types to standard connector types (`string`, `boolean`, `int`, `long`) in `fetchIdentitySchemaAttributes`
- [x] 1.3 Update error logging in `buildDynamicSchema` when fetching identity attributes fails

## 2. Implement Casing-Preserving Deduplication

- [x] 2.1 Update `buildDynamicSchema` deduplication loop to preserve the first-added casing when keys collision (case-insensitively) occurs

## 3. Verification and Validation

- [x] 3.1 Run `npm test` to verify existing tests and any new test coverage for these edge cases
- [x] 3.2 Add new unit tests to `schemaService.test.ts` covering case-preservation, type-mapping fallback, name sanitization, and API errors
- [x] 3.3 Validate the change behavior using OpenSpec CLI validation: run `openspec validate fix-identity-schema-discovery-bugs --type change --strict`
