## 1. Identity Pruning Helpers

- [x] 1.1 Create `pruneIdentityDocumentAttributes` helper in `src/services/identityService.ts` (or `referencedAttributeSet.ts`) to filter attributes against `referencedAttributeSet` plus core fields
- [x] 1.2 Create `filterIdentityAccounts` helper to keep only Fusion source accounts and configured managed source accounts
- [x] 1.3 Add unit tests for identity attribute pruning and linked account filtering

## 2. Ingestion Pipeline Wiring

- [x] 2.1 Wire attribute and account pruning into `IdentityService.fetchIdentities` inside the `forEachChunked` page iteration loop
- [x] 2.2 Wire attribute and account pruning into `IdentityService.fetchIdentityById`
- [x] 2.3 Verify `referencedAttributeSet` and managed source names are passed to `IdentityService` at initialization

## 3. Verification

- [x] 3.1 Confirm canonical test command: `npm test`
- [x] 3.2 All delta spec scenarios covered by named automated tests in `identityService.test.ts`
- [x] 3.3 Verify heap footprint reduction in synthetic high-volume identity tests

## 4. Documentation

- [x] 4.1 Update `docs/concepts/glossary.md` with Identity Document Pruning and Identity Account Filtering entries
- [x] 4.2 Update architecture reference docs in `docs/reference/` describing Phase 2 identity ingestion

## 5. Changelog

- [x] 5.1 Create or update changelog entry for this change
- [x] 5.2 Confirm entry covers user-visible changes from proposal Capabilities
