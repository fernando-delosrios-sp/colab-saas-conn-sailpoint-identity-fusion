## 2026-08-25 - Simplify chained property reads
**Learning:** Chained nullish coalescing for unknown property resolution (e.g., `readUnknown(obj, 'a') ?? readUnknown(obj, 'b')`) is harder to read than a single helper.
**Action:** Replaced chained `readUnknown` calls with `readFirstUnknown(obj, ['a', 'b'])` to improve scanability while maintaining safe fallback behavior.
