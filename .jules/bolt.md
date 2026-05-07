## 2026-05-07 - Use Zero-Copy Accessors in Hot Loops
**Learning:** Array-generating getters (like `[...this._fusionMatches]`) cause O(N) memory allocation and processing overhead on every call. Using them inside hot loops (like array traversal) significantly degrades performance.
**Action:** Replace array-generating getters with zero-copy `ReadonlySet` or `readonly Array` accessors (e.g. `fusionMatchesRaw`) when performing read-only operations like `.find()`, `.some()`, or `.filter()`.
