## 2024-08-15 - Replace repeated `readUnknown` with a dedicated helper
**Learning:** Repetitive object property fallback chains (e.g., chained nullish coalescing `??` operations like `readUnknown(attrs, 'email') ?? readUnknown(attrs, 'mail')`) are used multiple times in the codebase.
**Action:** Replace them with a dedicated variadic helper function `readFirstUnknown` to encapsulate the fallback logic, improve DRYness, and clarify intent.
