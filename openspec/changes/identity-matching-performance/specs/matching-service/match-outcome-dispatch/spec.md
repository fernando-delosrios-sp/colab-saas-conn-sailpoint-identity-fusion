## MODIFIED Requirements

### Requirement: MatchOutcomeDispatcher exposes `runMatchSweep` as its public interface

`MatchOutcomeDispatcher` SHALL expose a single public method `runMatchSweep(accounts, batchSize, options?): MatchSweepResult` that scores the supplied accounts and dispatches each to its outcome. No other public method on `MatchOutcomeDispatcher` SHALL be required by callers to perform a managed-account matching sweep. Identity-phase scoring SHALL pass the `getCandidates` result as the identity pool and SHALL pass `fusionMaxCandidatesForForm` as the top-K retention cap, not as a first-K comparison stop. MatchOutcomeDispatcher SHALL NOT substitute `run.allFusionIdentities` unless `getCandidates` returns undefined.

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

#### Scenario: Identity candidate pool uses getCandidates result including empty set

- **GIVEN** MatchingService.getCandidates returns a Set (including an empty Set)
- **WHEN** identity-phase scoring runs for a managed account
- **THEN** MatchOutcomeDispatcher SHALL pass that Set as the identity pool to scoreFusionAccount
- **AND** SHALL NOT substitute run.allFusionIdentities unless getCandidates returns undefined

#### Scenario: Identity scoring cap is top-K retention

- **GIVEN** identity-phase scoring for an uncorrelated authoritative account
- **WHEN** MatchOutcomeDispatcher calls scoreFusionAccount
- **THEN** the maxIdentityMatches argument SHALL mean retain at most that many identity matches after scoring the whole pool
- **AND** MatchOutcomeDispatcher SHALL NOT require MatchingService to stop comparing after the first K passing identities
