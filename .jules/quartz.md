## 2026-08-22 - Simplification Pattern: Replacing chained readUnknown
**Learning:** Chaining multiple `readUnknown` calls with nullish coalescing operators (e.g. `readUnknown(obj, 'a') ?? readUnknown(obj, 'b')`) can be simplified for readability and maintainability.
**Action:** Use the `readFirstUnknown(obj, ['a', 'b'])` utility to replace these chained calls, improving readability while maintaining fallback behavior.
