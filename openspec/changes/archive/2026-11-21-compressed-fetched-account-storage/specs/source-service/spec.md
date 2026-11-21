## ADDED Requirements

### Requirement: SourceService fusionAccountsByNativeIdentity SHALL use compressed in-memory block storage

`SourceService.fetchFusionAccounts()` SHALL store fetched Fusion accounts in `fusionAccountsByNativeIdentity` backed by `CompressedBlockMap<Account>` so large Fusion account populations are compressed in memory during `Fetch` and `Refresh` while preserving the `Map<string, Account>` contract (`get`, `has`, `delete`, `values`, `size`, `clear`). Calling `clearFusionAccounts()` SHALL release all compressed blocks and LRU caches immediately.

#### Scenario: Fetched Fusion accounts are stored in compressed blocks and released on clear
- **GIVEN** `SourceService.fetchFusionAccounts()` ingests Fusion accounts beyond the in-heap threshold
- **WHEN** `Refresh` iterates `fusionAccountValues()` and looks up accounts by `nativeIdentity`
- **THEN** all fetched Fusion accounts SHALL be returned with intact attributes and metadata
- **AND** calling `clearFusionAccounts()` SHALL reset `fusionAccountCount` to `0` and release all compressed blocks
