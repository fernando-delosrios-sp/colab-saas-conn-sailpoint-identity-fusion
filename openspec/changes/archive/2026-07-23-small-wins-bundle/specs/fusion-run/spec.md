## ADDED Requirements

### Requirement: FusionRun tracks full-scan trigram fallback count

FusionRun SHALL expose a run-scoped numeric field `fullScanFallbackCount` initialized to zero at run start. MatchingService SHALL increment this field when trigram candidate blocking falls back to a full identity scan due to missing mandatory attribute values on a managed account.

#### Scenario: Counter starts at zero
- **WHEN** a new FusionRun is constructed for an operation
- **THEN** `fullScanFallbackCount` SHALL be `0`

#### Scenario: Counter accumulates across multiple accounts
- **GIVEN** two managed accounts each triggering full-scan fallback in the same run
- **WHEN** both are processed through `getCandidates`
- **THEN** `fullScanFallbackCount` SHALL equal `2`

### Requirement: FusionRun exposes non-copying fusion account iteration

FusionRun SHALL provide `fusionAccountsIterable()` returning an iterable over fusion accounts in `_fusionAccountMap` without allocating a new array. The existing `allFusionAccounts` getter SHALL continue to return a defensive copy for callers requiring a mutable array or spread composition.

#### Scenario: Iterable yields all fusion accounts
- **GIVEN** fusion accounts registered in `run.fusionAccountMap`
- **WHEN** a consumer iterates `run.fusionAccountsIterable()`
- **THEN** each registered fusion account SHALL be yielded exactly once

#### Scenario: Getter copy preserved for array consumers
- **WHEN** a caller accesses `run.allFusionAccounts`
- **THEN** a new array copy SHALL be returned
- **AND** mutating the returned array SHALL NOT mutate internal run state
