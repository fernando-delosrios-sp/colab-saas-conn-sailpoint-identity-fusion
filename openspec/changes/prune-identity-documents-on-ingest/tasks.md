## 1. Identity Pruning Helpers

- [ ] 1.1 Create `pruneIdentityDocumentAttributes` helper in `src/services/identityService.ts` (or `referencedAttributeSet.ts`) to filter attributes against `referencedAttributeSet` plus core fields
- [ ] 1.2 Create `filterIdentityAccounts` helper to keep only Fusion source accounts and configured managed source accounts
- [ ] 1.3 Add unit tests for identity attribute pruning and linked account filtering

## 2. Ingestion Pipeline Wiring

- [ ] 2.1 Wire attribute and account pruning into `IdentityService.fetchIdentities` inside the `forEachChunked` page iteration loop
- [ ] 2.2 Wire attribute and account pruning into `IdentityService.fetchIdentityById`
- [ ] 2.3 Verify `referencedAttributeSet` and managed source names are passed to `IdentityService` at initialization

## 3. Verification

- [ ] 3.1 Confirm canonical test command: `npm test`
- [ ] 3.2 All delta spec scenarios covered by named automated tests in `identityService.test.ts`
- [ ] 3.3 Verify heap footprint reduction in synthetic high-volume identity tests

## 4. Documentation

- [ ] 4.1 Update `docs/concepts/glossary.md` with Identity Document Pruning and Identity Account Filtering entries
- [ ] 4.2 Update architecture reference docs in `docs/reference/` describing Phase 2 identity ingestion

## 5. Changelog

- [ ] 5.1 Create or update changelog entry for this change
- [ ] 5.2 Confirm entry covers user-visible changes from proposal Capabilities
