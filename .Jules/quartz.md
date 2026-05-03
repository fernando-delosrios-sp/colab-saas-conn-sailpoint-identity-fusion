## 2026-05-02 - Combine sequential array validations
**Learning:** Using multiple `if` checks with `some` and `every` sequentially can obscure the core validation rule.
**Action:** Combine sequential validation steps into a single, declarative `.every()` condition where appropriate to make the entire rule immediately visible.

## 2026-05-03 - Remove Redundant Map Lookups
**Learning:** Using Map.has() immediately followed by Map.get()! is a common anti-pattern that subverts the type checker and performs redundant lookups. A single Map.get() with a truthiness check is safer and cleaner.
**Action:** When retrieving items from a Map, prefer a single get() call and check the result instead of separate has() and get() calls.
