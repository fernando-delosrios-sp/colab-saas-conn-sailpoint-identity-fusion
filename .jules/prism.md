## 2023-10-18 - Missing Recording Directories Ignore Pattern
**Learning:** In the identity-fusion repository, pre-existing test failures related to missing recording directories (e.g., `recordings/.../steps.ndjson`) surface during general test runs (`pnpm test`). These failures originate from missing local test fixtures (`ENOENT`) rather than code changes.
**Action:** These specific `ENOENT` failures in `reportService.recording.test.ts` can be safely ignored when verifying simplifications that do not touch test data or dependencies.
## 2023-10-21 - ReadFirstUnknown Simplification
**Learning:** Chained `readUnknown` calls with nullish coalescing (e.g., `readUnknown(obj, 'a') ?? readUnknown(obj, 'b')`) can be replaced with `readFirstUnknown(obj, ['a', 'b'])` (introduced in `src/utils/safeRead.ts`) to improve readability. This utility preserves exactly the behavior of `??`, including explicit `null` fallback, while preventing repetitive boilerplate.
**Action:** Use `readFirstUnknown` when extracting the first available property from an object among a set of possible fallback keys.
