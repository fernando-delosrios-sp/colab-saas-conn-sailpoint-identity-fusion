## 2026-05-15 - Consolidating ISC Object Attribute Extraction

**Learning:** When parsing raw ISC entitlement representations (often arrays of `{id}`, `{value}`, or `{name}` objects), logic to extract the actual identifier string is often duplicated across different mapping functions.
**Action:** Extract this `readUnknown(item, 'id') ?? readUnknown(item, 'value') ?? readUnknown(item, 'name')` fallback chain into a dedicated `extractObjectValue` helper to ensure consistency, improve readability, and keep extraction loops DRY.
## 2024-05-18 - Missing Try/Catch Edge Case in MessagingService Origin Parse
**Learning:** Testing private methods directly using `any` casting bypasses visibility restrictions and is often the best approach to cover internal code logic without exposing implementation details to the public API just for tests.
**Action:** Created dedicated test file `messagingService.headerSubtitle.test.ts` to mock private URL parsing and ensure edge-case URL exceptions fall back correctly to undefined as implemented.
