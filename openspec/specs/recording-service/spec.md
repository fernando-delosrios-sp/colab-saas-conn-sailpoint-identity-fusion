# recording-service Spec

## Purpose

The recording service captures the outcomes of managed-account analysis (matches, deferred candidate matches, non-matches, and failures) into the aggregation tracker so they can be reported to downstream connector operations and aggregation consumers.

## Requirements

### Requirement: Record managed account analysis for identity-backed matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL be called exactly once per managed account after the two-sweep analysis (identity scoring + deferred candidate scoring) completes. It SHALL record an identity-backed match by pushing the `FusionAccount` into `tracker.matchAccounts` and logging match discovery information. The method SHALL NOT be called during intermediate phases of the analysis pipeline.

#### Scenario: Account has identity-backed matches
- **WHEN** `recordAnalysis` is called with a `FusionAccount` whose `isMatch` is true and `hasIdentityBackedMatches` is true
- **THEN** the `FusionAccount` MUST be added to `tracker.matchAccounts`
- **AND** `tracker.fusionIdentityComparisonsByAccount` MUST be updated with the comparison count

---

### Requirement: Record managed account analysis for deferred matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL be called exactly once per managed account after the two-sweep analysis completes. It SHALL record deferred match candidates into `tracker.deferredMatchReportData` when report data capture is enabled and the account has deferred candidate matches but no identity-backed matches.

#### Scenario: Account has deferred candidate matches
- **WHEN** `recordAnalysis` is called with a `FusionAccount` whose `isMatch` is true, `hasIdentityBackedMatches` is false, and matches have candidate type `Deferred`
- **THEN** `tracker.deferredMatchReportData` MUST receive a report account with `deferred: true`, comparison count, and mapped match candidates

---

### Requirement: Record managed account analysis for non-matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL be called exactly once per managed account after the two-sweep analysis completes. It SHALL record non-matching accounts into `tracker.analyzedNonMatchReportData` when report data capture is enabled. The method SHALL NOT receive a `deferredPhaseExecuted` parameter; the caller guarantees both analysis sweeps are complete before recording.

#### Scenario: Account does not match and report capture is enabled
- **WHEN** `recordAnalysis` is called with a non-matching account and report data capture is enabled
- **THEN** `tracker.analyzedNonMatchReportData` MUST receive a minimal fusion report account with comparison count and resolved report account id

#### Scenario: Account recorded once regardless of deferred status
- **WHEN** `recordAnalysis` is called with an account from a deferred-candidate-matching-enabled source that did not match in either sweep
- **THEN** the recorder MUST record the non-match exactly once
- **AND** the recorder MUST NOT check whether the account was deferred (the caller guarantees this)

---

### Requirement: Record failed matching
The `ManagedAccountAnalysisRecorder.trackFailed` method SHALL record a failed matching entry in `tracker.failedMatchingAccounts` when report data capture is enabled.

#### Scenario: Matching fails for an account
- **WHEN** `trackFailed` is called with a `FusionAccount` and an error message
- **THEN** a warning/error message MUST be logged
- **AND** `tracker.failedMatchingAccounts` MUST contain a minimal fusion report account with the error message and resolved report account id
