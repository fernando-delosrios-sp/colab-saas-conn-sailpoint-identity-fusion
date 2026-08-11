## 2026-08-11 - Do not compromise type safety for apparent line reduction
**Learning:** Replacing a nullish coalescing chain designed for `unknown` object structures (e.g., `readUnknown(...) ?? readUnknown(...)`) with a utility expecting a strict type (`Record<string, any>`) forces ugly manual type assertions and harms true readability.
**Action:** When simplifying code, avoid changes that require adding new type casts (`as ...`) or defensive undefined checks that weren't present before.
