## ADDED Requirements

### Requirement: Record managed account analysis for identity-backed matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL record an identity-backed match by pushing the `FusionAccount` into `tracker.matchAccounts` and logging match discovery information.

#### Scenario: Account has identity-backed matches
- **WHEN** `recordAnalysis` is called with a `FusionAccount` whose `isMatch` is true and `hasIdentityBackedMatches` is true
- **THEN** the `FusionAccount` MUST be added to `tracker.matchAccounts`
- **AND** `tracker.fusionIdentityComparisonsByAccount` MUST be updated with the comparison count

---

### Requirement: Record managed account analysis for deferred matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL record deferred match candidates into `tracker.deferredMatchReportData` when report data capture is enabled and the account is not identity-backed.

#### Scenario: Account has new unmatched peer matches
- **WHEN** `recordAnalysis` is called with a `FusionAccount` whose `isMatch` is true, `hasIdentityBackedMatches` is false, and matches have candidate type `NewUnmatched`
- **THEN** `tracker.deferredMatchReportData` MUST receive a report account with `deferred: true`, comparison count, and mapped match candidates

---

### Requirement: Record managed account analysis for non-matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL record non-matching accounts into `tracker.analyzedNonMatchReportData` when report data capture is enabled and deferred matching is not active for authoritative sources.

#### Scenario: Account does not match and report capture is enabled
- **WHEN** `recordAnalysis` is called with a non-matching account and report data capture is enabled
- **THEN** `tracker.analyzedNonMatchReportData` MUST receive a minimal fusion report account with comparison count and resolved report account id

#### Scenario: Authoritative account is deferred
- **WHEN** `recordAnalysis` is called with a non-matching authoritative account and deferred matching is enabled for the source
- **THEN** the recorder MUST skip recording non-match report data for that account

---

### Requirement: Record failed matching
The `ManagedAccountAnalysisRecorder.trackFailed` method SHALL record a failed matching entry in `tracker.failedMatchingAccounts` when report data capture is enabled.

#### Scenario: Matching fails for an account
- **WHEN** `trackFailed` is called with a `FusionAccount` and an error message
- **THEN** a warning/error message MUST be logged
- **AND** `tracker.failedMatchingAccounts` MUST contain a minimal fusion report account with the error message and resolved report account id

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
