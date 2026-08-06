## 2026-08-06 - Extract repeated identity display name resolution
**Learning:** The logic to resolve a display name from an Identity document (checking `displayName`, `attributes.displayName`, and `name` with `any` casting) was duplicated in `decisionProcessor.ts`.
**Action:** Created `resolveIdentityDisplayName` in `src/utils/identityName.ts` to centralize this logic, replacing the inline checks and type casting in `decisionProcessor.ts` to improve clarity and maintainability.
