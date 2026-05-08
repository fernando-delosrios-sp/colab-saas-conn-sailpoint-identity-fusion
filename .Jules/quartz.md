## 2026-05-02 - Combine sequential array validations
**Learning:** Using multiple `if` checks with `some` and `every` sequentially can obscure the core validation rule.
**Action:** Combine sequential validation steps into a single, declarative `.every()` condition where appropriate to make the entire rule immediately visible.

## 2026-05-03 - Remove Redundant Map Lookups
**Learning:** Using Map.has() immediately followed by Map.get()! is a common anti-pattern that subverts the type checker and performs redundant lookups. A single Map.get() with a truthiness check is safer and cleaner.
**Action:** When retrieving items from a Map, prefer a single get() call and check the result instead of separate has() and get() calls.
## 2026-05-03 - [Extracted Domain Logic]
**Learning:** Dense logic in domain models with multiple loops and map accesses can be easily simplified by splitting it into sequential helper methods. Using pass-by-reference logic, Javascript Map and Set objects can be cleanly mutated inside helpers without complex return structures.
**Action:** In future, extract deep conditional chains handling domain concepts into appropriately named private helpers instead of keeping them fully inline.
## 2026-05-02 - Combine sequential array validations
**Learning:** Using multiple `if` checks with `some` and `every` sequentially can obscure the core validation rule.
**Action:** Combine sequential validation steps into a single, declarative `.every()` condition where appropriate to make the entire rule immediately visible.
## 2026-05-06 - Simplify Set Intersections
**Learning:** Dense logic in domain models with multiple loops and map accesses can be easily simplified by splitting it into sequential helper methods. Using pass-by-reference logic, Javascript Map and Set objects can be cleanly accessed (like `.accountIdsSet`) inside helpers without complex return structures or creating arrays with `Array.from()`.
**Action:** In future, extract deep conditional chains handling domain concepts into appropriately named private helpers instead of keeping them fully inline.
