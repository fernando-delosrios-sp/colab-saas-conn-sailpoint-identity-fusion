## MODIFIED Requirements

### Requirement: MatchOutcomeDispatcher exposes `runMatchSweep` as its public interface

`MatchOutcomeDispatcher` SHALL expose a single public method `runMatchSweep(accounts, batchSize, options?): MatchSweepResult` that scores the supplied accounts and dispatches each to its outcome. No other public method on `MatchOutcomeDispatcher` SHALL be required by callers to perform a managed-account matching sweep.

#### Scenario: Identity candidate pool uses getCandidates result including empty set

- **GIVEN** MatchingService.getCandidates returns a Set (including an empty Set)
- **WHEN** identity-phase scoring runs for a managed account
- **THEN** MatchOutcomeDispatcher SHALL pass that Set as the identity pool to scoreFusionAccount
- **AND** SHALL NOT substitute run.allFusionIdentities unless getCandidates returns undefined
