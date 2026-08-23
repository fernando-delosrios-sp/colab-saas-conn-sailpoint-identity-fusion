## 2024-05-24 - [readFirstUnknown simplification]
**Learning:** In the identity-fusion repository, chaining `readUnknown(obj, 'a') ?? readUnknown(obj, 'b')` should be replaced with `readFirstUnknown(obj, ['a', 'b'])` to improve readability while maintaining fallback behavior.
**Action:** Use `readFirstUnknown` when replacing chained nullish coalescing operations with `readUnknown`, ensuring it returns the last evaluated value if all values are nullish.
