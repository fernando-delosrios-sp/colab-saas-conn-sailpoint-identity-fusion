## 2023-10-27 - Test failures with missing recording directories
**Learning:** Pre-existing test failures related to missing recording directories (e.g., recordings/.../steps.ndjson) can be safely ignored during verification if the changes do not affect test data or dependencies.
**Action:** Ignore test failures for `src/services/__tests__/reportService.recording.test.ts` if they stem from `ENOENT: no such file or directory, open '/app/recordings/.../steps.ndjson'`.
