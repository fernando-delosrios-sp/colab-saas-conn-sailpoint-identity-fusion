## ADDED Requirements

### Requirement: Early account emission mode

The system SHALL support an optional configuration toggle `fusionDropAccountsAfterEmit` (default `false`) that controls whether assembled accounts are streamed to ISC during identity processing and dropped from memory before the uncorrelated match sweep.

#### Scenario: Early emission disabled by default

- **GIVEN** `fusionDropAccountsAfterEmit` is false or omitted
- **WHEN** the account-list operation is executed
- **THEN** all fusion accounts SHALL be retained in memory through Phase 3 and Phase 4
- **AND** all eligible fusion accounts SHALL be streamed to the client during Phase 5 (Output)

#### Scenario: Early emission streams accounts during identity processing

- **GIVEN** `fusionDropAccountsAfterEmit` is true
- **WHEN** an identity is processed and its initial fusion account is assembled in Phase 3 or Phase 4
- **THEN** the system SHALL stream the corresponding `ISCAccount` to the client response immediately
- **AND** the system SHALL drop the full `FusionAccount` instance from memory before the uncorrelated match sweep begins

#### Scenario: Early emission re-emits auto-matched accounts

- **GIVEN** `fusionDropAccountsAfterEmit` is true
- **AND** an account was already streamed during early emission
- **WHEN** an uncorrelated managed account triggers an automatic match (exact match above auto-merge threshold) against that identity
- **THEN** the system SHALL re-fetch the identity from the ISC API
- **AND** re-assemble the fusion account with the new managed account layer
- **AND** stream the updated `ISCAccount` to the client response
