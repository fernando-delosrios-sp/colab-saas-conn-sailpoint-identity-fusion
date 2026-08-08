## 2026-08-08 - Safely refactoring nullish coalescing operators (??)
**Learning:** When refactoring nested nullish coalescing (`??`) and ternary operators into sequential `if` checks for clarity, a simple truthiness check (e.g. `if (name)`) is dangerous because it changes behavior for valid falsy values (like `""` or `0`). The `??` operator specifically skips only `null` and `undefined`.
**Action:** Always use `!= null` (which safely covers both `null` and `undefined`) when replacing `??` chains with `if` early returns, rather than naive truthy checks, to ensure exact behavior preservation.
