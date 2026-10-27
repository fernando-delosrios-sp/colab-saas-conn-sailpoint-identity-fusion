## ADDED Requirements

### Requirement: Streaming Refresh Phase Processing

FusionService SHALL process refreshed Fusion accounts directly from map iterables in concurrent batches without allocating an intermediate array of all accounts or accumulating a full results array, and SHALL incrementally delete each raw account from the fetch cache upon completing its processing when not in record mode.

#### Scenario: Refresh processing consumes map iterables without full-array materialization

- **GIVEN** a collection of raw Fusion accounts loaded in the source fetch cache
- **WHEN** `FusionService.processFusionAccounts` executes during the Refresh phase
- **THEN** it SHALL pull items in batches directly from the cache's values iterator
- **AND** it SHALL NOT convert the full cache into an intermediate array
- **AND** it SHALL track the count of completed accounts without accumulating an array of all results

#### Scenario: Raw fusion account cache is depleted incrementally during refresh

- **GIVEN** a raw Fusion account is being processed during the Refresh phase
- **AND** record mode is not active
- **WHEN** the account's corresponding `FusionAccount` is constructed and registered in `FusionRun`
- **THEN** the raw account SHALL be deleted from the source service's fusion accounts cache immediately
- **AND** raw and hydrated representations SHALL NOT coexist after processing completes
