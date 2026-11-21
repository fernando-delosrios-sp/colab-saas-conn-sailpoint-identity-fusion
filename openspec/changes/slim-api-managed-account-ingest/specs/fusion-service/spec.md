## ADDED Requirements

### Requirement: FusionService SHALL stream correlated managed account and record unique registration sweeps in bounded chunks

`FusionService.processRecordUniqueRegistration()` SHALL return `{ registered: 0 }` without scanning `run.managedAccountsById` when no configured `SourceType.Record` source has Match scoring disabled, and SHALL otherwise process eligible accounts in bounded `4,096`-account chunks. `FusionService.processCorrelatedManagedAccounts()` SHALL likewise stream remaining `uncorrelated === false` accounts in bounded `4,096`-account chunks.

#### Scenario: Record unique registration short-circuits without scanning the work queue when no Record source disables Match
- **GIVEN** a `FusionService` where every configured `SourceType.Record` source has Match scoring enabled (or no Record sources exist)
- **WHEN** `processRecordUniqueRegistration()` executes
- **THEN** it SHALL return `{ registered: 0 }` immediately without iterating or decompressing `run.managedAccountsById.values()`

#### Scenario: Record unique registration streams eligible accounts in bounded chunks
- **GIVEN** a `FusionService` with a `SourceType.Record` source configured with `includeRecordAccountsForMatching: false` and more eligible accounts in `run.managedAccountsById` than the sweep chunk size
- **WHEN** `processRecordUniqueRegistration()` executes
- **THEN** unique values SHALL be registered and accounts claimed in bounded chunks
- **AND** the returned `registered` count SHALL equal the total number of eligible Record accounts processed across all chunks

#### Scenario: Correlated account sweep streams correlated accounts in bounded chunks
- **GIVEN** a `FusionService` with more `uncorrelated === false` managed accounts in `run.managedAccountsById` than the sweep chunk size
- **WHEN** `processCorrelatedManagedAccounts()` executes
- **THEN** the correlated accounts SHALL be processed in bounded chunks without materializing a single full-population array
- **AND** all processed correlated accounts SHALL be claimed from `run.managedAccountsById`
