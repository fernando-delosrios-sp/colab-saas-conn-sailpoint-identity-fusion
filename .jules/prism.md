## 2026-08-24 - Safe object property resolution chaining
**Learning:** Simplifying chained readUnknown calls (e.g., readUnknown(obj, 'a') ?? readUnknown(obj, 'b')) with the readFirstUnknown(obj, ['a', 'b']) utility improves readability while preserving fallback behavior and safe handling of unknown objects.
**Action:** Replace chained readUnknown calls with readFirstUnknown.
