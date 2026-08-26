## MODIFIED Requirements

### Requirement: Correlated pre-score skip-linked and correlated-orphan SHALL NOT log INFO per account

When `resolveAccountBeforeScoring` drops a correlated managed account already linked in Fusion (skip-linked), or treats a correlated managed account that is not linked as a non-match (correlated-orphan), it SHALL NOT emit an INFO line per account. Per-account traces MAY be emitted at debug when debug logging is enabled. Work-queue claim, skip-linked return, and correlated-orphan assemble + non-match handling SHALL remain unchanged. FusionService SHALL still call `runMatchSweep([account], 1)` for each correlated account.

#### Scenario: Skip-linked does not log INFO per account

- **GIVEN** a correlated managed account whose key is already linked on a loaded Fusion account
- **WHEN** `resolveAccountBeforeScoring` runs
- **THEN** the account SHALL be claimed and returned as skip-linked
- **AND** no INFO line SHALL include the managed account name for that drop

#### Scenario: Correlated-orphan does not log INFO per account

- **GIVEN** a correlated managed account that is not linked to any loaded Fusion account
- **WHEN** `resolveAccountBeforeScoring` runs
- **THEN** the account SHALL follow the existing correlated-orphan non-match path
- **AND** no INFO line SHALL include the managed account name for that non-match

#### Scenario: Correlated sweep still uses one-account match sweeps

- **GIVEN** three correlated managed accounts on the work queue
- **WHEN** FusionService runs the correlated account sweep
- **THEN** MatchOutcomeDispatcher SHALL receive `runMatchSweep([account], 1)` once per account
- **AND** FusionService SHALL NOT pass all three accounts in a single uncorrelated-style sweep
