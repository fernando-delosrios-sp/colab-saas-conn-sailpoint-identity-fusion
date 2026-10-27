## 1. Configuration & Domain Types

- [x] 1.1 Add `fusionDropAccountsAfterEmit` toggle setting to `connector-spec.json` under Advanced Options
- [x] 1.2 Add `fusionDropAccountsAfterEmit` boolean property to `FusionConfig` and settings parser
- [x] 1.3 Define `MatchCandidateRecord` interface and factory in domain models

## 2. Decoupled Match Candidate Record

- [x] 2.1 Refactor `MatchingService.buildTrigramIndex` and `blockingIdentityRoster` to index `MatchCandidateRecord` instances
- [x] 2.2 Update candidate scoring methods in `MatchingService` to accept `MatchCandidateRecord`
- [x] 2.3 Update `FormService.buildCandidateList` and `buildFormInput` to consume candidate attributes from `MatchCandidateRecord`
- [x] 2.4 Update `FusionReportBuilder` to extract candidate report fields from `MatchCandidateRecord`

## 3. Early Account Emission Pipeline

- [x] 3.1 Introduce early emission hook in `FusionService` / `AccountListPhases` when `fusionDropAccountsAfterEmit` is enabled
- [x] 3.2 Stream formatted `ISCAccount`s to `res.send()` during Phase 3 & Phase 4 identity processing
- [x] 3.3 Clear emitted `FusionAccount` instances from `FusionRun` maps prior to `processUncorrelatedManagedAccounts`
- [x] 3.4 Update Phase 5 (Output) to track emitted accounts and only stream accounts created during the match sweep

## 4. On-Demand Auto-Match Rebuild & Re-Emission

- [x] 4.1 Update `handleExactMatch` in `MatchOutcomeDispatcher` to detect dropped target accounts when early emit is active
- [x] 4.2 Re-fetch identity via `IdentityService.fetchIdentityById` and re-assemble `FusionAccount` with the matched managed account layer
- [x] 4.3 Re-evaluate attribute definitions and stream the updated `ISCAccount` to `res.send()` (last-write-wins)

## 5. Verification

- [x] 5.1 Confirm canonical test command: `npm test`
- [x] 5.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)
- [x] 5.3 Unit test verifying memory release and clean heap profile when toggle is enabled

## 6. Documentation

- [x] 6.1 Update `docs/use-guides/` configuration guide for the new Advanced Option toggle
- [x] 6.2 Update `docs/concepts/glossary.md` with Match Candidate Record and Early Account Emission terms
- [x] 6.3 Update JSDoc and connector-spec inline help text for `fusionDropAccountsAfterEmit`

## 7. Changelog

- [x] 7.1 Create or update changelog entry for this change
- [x] 7.2 Confirm entry covers user-visible changes from proposal Capabilities
