## ADDED Requirements

### Requirement: FusionService SHALL stream uncorrelated managed accounts in bounded chunks

`FusionService.processUncorrelatedManagedAccounts()` SHALL iterate `run.managedAccountsById.values()` in bounded chunks (default `4,096` accounts per chunk) and dispatch each chunk through `runMatchSweep()` with `{ progressOffset, progressTotal }` rather than materializing the entire remaining work queue into a single `Account[]` array in V8 heap.

#### Scenario: Uncorrelated sweep processes multiple chunks without materializing a single full-population array
- **GIVEN** a `FusionService` with `run.managedAccountsById` containing more uncorrelated accounts than the sweep chunk size
- **WHEN** `processUncorrelatedManagedAccounts()` executes
- **THEN** `dispatcher.runMatchSweep()` SHALL be invoked once per bounded chunk in iteration order
- **AND** the returned `processed` count SHALL equal the total number of accounts processed across all chunks
- **AND** `linkedAccountKeyIndex` and managed-account processing state SHALL be cleared after the final chunk completes
