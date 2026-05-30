## 2026-05-15 - Consolidating ISC Object Attribute Extraction

**Learning:** When parsing raw ISC entitlement representations (often arrays of `{id}`, `{value}`, or `{name}` objects), logic to extract the actual identifier string is often duplicated across different mapping functions.
**Action:** Extract this `readUnknown(item, 'id') ?? readUnknown(item, 'value') ?? readUnknown(item, 'name')` fallback chain into a dedicated `extractObjectValue` helper to ensure consistency, improve readability, and keep extraction loops DRY.
## 2026-05-17 - Error Handling Testing
**Learning:** Testing error handling paths (catch blocks) requires simulating failures in dependent functions.
**Action:** Mock the dependent function (e.g. `rebuildFusionAccount`) using `jest.Mock.mockRejectedValue` to throw specific errors (like `ConnectorError` or generic `Error`) to trigger and verify the different branches within the catch block.
## 2024-05-18 - Missing Try/Catch Edge Case in MessagingService Origin Parse
**Learning:** Testing private methods directly using `any` casting bypasses visibility restrictions and is often the best approach to cover internal code logic without exposing implementation details to the public API just for tests.
**Action:** Created dedicated test file `messagingService.headerSubtitle.test.ts` to mock private URL parsing and ensure edge-case URL exceptions fall back correctly to undefined as implemented.
## 2026-05-22 - Extracting Mixed-Type Array Normalization Logic

**Learning:** When multiple functions iterate over mixed-type arrays (e.g., parsing varying SDK shapes like strings or objects) to extract normalized string values, the loop and type-checking logic is often duplicated (e.g. in `toSetFromAttribute` and `normalizeActionTokens`).
**Action:** Encapsulate the loop and type-checking logic into a shared helper function (like `normalizeArrayItems`) to eliminate duplicate code blocks, clarify intent, and ensure consistency when handling these mixed-type arrays.
## 2026-05-26 - Consolidating Repeated Attribute Fallbacks

**Learning:** When trying to extract an attribute from an object that might be stored under various potential keys (e.g. `email` vs `mail` vs `emailAddress`), chaining `readUnknown` calls with nullish coalescing operators makes the code harder to scan.
**Action:** Replace `readUnknown(attrs, 'email') ?? readUnknown(...)` fallback chains with the repository's dedicated `getFirstValidAttribute(attrs, 'email', ...)` helper function to encapsulate the extraction logic and significantly improve readability.
## 2026-05-30 - Extract Account Key Helper in Sorting
**Learning:** Duplicate fallback chains used to extract account identifiers inside sort comparators (e.g. `readUnknown(a, 'originAccountId') ?? readPathString(a, ...) ?? ...`) make the code hard to read and scan.
**Action:** Extract this logic into a small, well-named local helper function (like `getAccountKey`) before the sort block to make the sorting intent obvious and keep the code DRY.
