## MODIFIED Requirements

### Requirement: MatchOutcomeDispatcher exposes `runMatchSweep` as its public interface

`MatchOutcomeDispatcher` SHALL expose a single public method `runMatchSweep(accounts, batchSize, options?): MatchSweepResult` that scores the supplied accounts and dispatches each to its outcome. No other public method on `MatchOutcomeDispatcher` SHALL be required by callers to perform a managed-account matching sweep.

#### Scenario: FusionService invokes one verb

- **WHEN** `FusionService.processUncorrelatedManagedAccounts` drains the remaining work queue
- **THEN** FusionService SHALL call `matchOutcomeDispatcher.runMatchSweep(accounts, batchSize)` exactly once with the full queue
- **AND** MatchOutcomeDispatcher SHALL execute the identity scoring sweep and deferred drain inside that single invocation
- **WHEN** `FusionService.processCorrelatedManagedAccounts` processes correlated managed accounts
- **THEN** FusionService SHALL call `matchOutcomeDispatcher.runMatchSweep([account], 1)` for each correlated account
- **AND** FusionService SHALL NOT batch all correlated accounts into one uncorrelated-style sweep call

#### Scenario: MatchSweepResult reports outcomes

- **WHEN** `runMatchSweep()` completes
- **THEN** it SHALL return `MatchSweepResult` containing `processed`, `matchScoringMs`, counts by resolution, and a `ResolvedMatch[]` list

---

## ADDED Requirements

### Requirement: MatchOutcomeDispatcher owns the two-sweep match lifecycle

MatchOutcomeDispatcher SHALL orchestrate the two-sweep matching lifecycle (identity scoring sweep → deferred drain). The identity sweep MAY score accounts in parallel batches. The deferred drain SHALL process pending accounts sequentially within each managed source in deterministic order, mutating the per-source candidate pool on FusionRun after each account. MatchingService SHALL be used as the scoring collaborator inside this lifecycle.

#### Scenario: Runner executes identity scoring sweep

- **WHEN** `runMatchSweep` processes uncorrelated managed accounts
- **THEN** MatchOutcomeDispatcher SHALL execute identity-phase scoring for all supplied accounts (parallel batches permitted)
- **AND** results SHALL be classified as identity-match or deferred-pending

#### Scenario: Runner executes deferred scoring sweep

- **WHEN** the identity sweep completes with deferred-pending accounts for a source
- **THEN** MatchOutcomeDispatcher SHALL evaluate each pending account one at a time against the current per-source candidate pool on FusionRun
- **AND** the pool SHALL include persisted fusion anchors plus materialized non-match anchors from earlier steps in the same drain
- **AND** results SHALL be classified as deferred-match or non-match before advancing to the next pending account
