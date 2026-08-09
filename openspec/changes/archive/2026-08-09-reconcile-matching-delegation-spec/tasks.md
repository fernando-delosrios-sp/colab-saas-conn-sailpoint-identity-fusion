## 1. Living spec updates — fusion-service

- [x] 1.1 Merge `openspec/changes/reconcile-matching-delegation-spec/specs/fusion-service/spec.md` delta into `openspec/specs/fusion-service/spec.md` (REMOVED old MatchingService delegation requirement; ADDED pipeline phases + MatchOutcomeDispatcher delegation)
- [x] 1.2 Verify no living `fusion-service` requirement references `MatchingService.processUncorrelatedManagedAccounts` or `ManagedAccountMatchingRunner`

## 2. Living spec updates — matching-service

- [x] 2.1 Merge matching-service delta into `openspec/specs/matching-service/spec.md`
- [x] 2.2 Update the **Purpose** paragraph: MatchingService provides scoring and trigram blocking; `MatchOutcomeDispatcher` owns outcome dispatch and two-sweep lifecycle; remove `ManagedAccountMatchingRunner` reference
- [x] 2.3 Confirm REMOVED "two-sweep matching runner" and MODIFIED CandidateRegistry + captureBreakdown requirements are reflected in living spec

## 3. Living spec updates — match-outcome-dispatch

- [x] 3.1 Merge match-outcome-dispatch delta into `openspec/specs/matching-service/match-outcome-dispatch/spec.md`
- [x] 3.2 Verify correlated (per-account) vs uncorrelated (batch) `runMatchSweep` scenarios are present in living spec

## 4. Living spec updates — ubiquitous-language

- [x] 4.1 Merge ubiquitous-language delta into `openspec/specs/ubiquitous-language/spec.md`
- [x] 4.2 Update Retired Terms table: retire `ManagedAccountMatchingRunner`; map both `ManagedAccountPassRunner` and `ManagedAccountMatchingRunner` → use `MatchOutcomeDispatcher`
- [x] 4.3 Update type-naming scenario example to cite `MatchOutcomeDispatcher` instead of `ManagedAccountMatchingRunner`

## 5. Validation and audit

- [x] 5.1 Run `openspec validate --all --json` — every item `"valid": true`
- [x] 5.2 Ripgrep living specs: no normative requirement for `MatchingService.processUncorrelatedManagedAccounts` or active `ManagedAccountMatchingRunner`
- [x] 5.3 Confirm `.scratch/spec-drift-report.md` matching delegation rows can be marked resolved (optional manual update)

## 6. Documentation

- [x] 6.1 Update README / getting-started — N/A (no user-visible connector behavior change); mark complete with reason
- [x] 6.2 Update API / connector docs — N/A (internal architecture docs only via OpenSpec); mark complete with reason
- [x] 6.3 Update inline docs (JSDoc) — N/A unless stale `ManagedAccountMatchingRunner` references found in `src/` during audit; if found, fix references to `MatchOutcomeDispatcher`

## 7. Changelog

- [x] 7.1 Create or update changelog entry noting spec reconciliation for matching delegation (no release behavior change)
- [x] 7.2 Confirm entry states spec-only alignment; no connector behavior change
