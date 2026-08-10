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
## 2026-08-10 - Variadic Object Fallback Readability
**Learning:** Repetitive object property fallback chains (e.g., chained nullish coalescing `??` operations like `readUnknown(attrs, 'email') ?? readUnknown(attrs, 'mail')`) reduce scanability.
**Action:** Replaced with a dedicated variadic helper function `readFirstUnknown(item, 'id', 'value', 'name')` to encapsulate the fallback logic, improve DRYness, and clarify intent.
