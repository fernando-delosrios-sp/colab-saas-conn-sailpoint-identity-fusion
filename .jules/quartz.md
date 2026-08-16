## 2024-05-18 - Replacing repetitive object property fallback chains
**Learning:** Repetitive fallback chains of nullish coalescing operators combined with `readUnknown` calls for extracting attributes from an object degrade scanability and duplicate fallback logic.
**Action:** Replace repetitive object property fallback chains (e.g., chained nullish coalescing `??` operations like `readUnknown(attrs, 'email') ?? readUnknown(attrs, 'mail')`) with a dedicated variadic helper function `getFirstUnknown` to encapsulate the fallback logic, improve DRYness, and clarify intent.
