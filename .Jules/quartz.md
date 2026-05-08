## 2026-05-08 - Refactor complex ensureIdentityProfileMapping logic
**Learning:** Extracting complex operations—especially those combining array fetching, error-handling validation, and data transformation mapping loops—into dedicated, specific helper functions significantly reduces the cognitive complexity of large service methods.
**Action:** Continually scan service classes for methods that exceed a single responsibility or a reasonable line-count threshold, specifically isolating API interactions from looping transformations.
