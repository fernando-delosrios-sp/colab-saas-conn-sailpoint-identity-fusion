## 2026-05-07 - Refactored accountRead and accountDisable to use a shared helper

**Learning:** Duplicate setup, reconstruction, and formatting code in operations `accountRead` and `accountDisable` reduced maintainability and readability. They shared the same execution path with the exception of invoking `.disable()` in the middle.

**Action:** Created `src/operations/helpers/readDisableShared.ts` exporting `processReadOrDisable` to reuse the operation setup logic, and refactored `accountRead` and `accountDisable` to call this helper.
