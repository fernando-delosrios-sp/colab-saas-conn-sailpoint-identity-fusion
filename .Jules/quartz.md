## 2026-05-02 - Combine sequential array validations
**Learning:** Using multiple `if` checks with `some` and `every` sequentially can obscure the core validation rule.
**Action:** Combine sequential validation steps into a single, declarative `.every()` condition where appropriate to make the entire rule immediately visible.