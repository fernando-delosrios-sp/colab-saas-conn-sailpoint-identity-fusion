## 2026-05-03 - [Extracted Domain Logic]
**Learning:** Dense logic in domain models with multiple loops and map accesses can be easily simplified by splitting it into sequential helper methods. Using pass-by-reference logic, Javascript Map and Set objects can be cleanly mutated inside helpers without complex return structures.
**Action:** In future, extract deep conditional chains handling domain concepts into appropriately named private helpers instead of keeping them fully inline.
