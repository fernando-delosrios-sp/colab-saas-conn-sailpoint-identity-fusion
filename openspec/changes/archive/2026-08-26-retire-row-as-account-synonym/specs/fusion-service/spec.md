## MODIFIED Requirements

### Requirement: FusionLayers claim-only absorb skips source snapshot materialization when live sources are not required

When `FusionLayers.addManagedAccountLayer` absorbs managed accounts from the work queue, it SHALL decide **once per Fusion account before any `claimAccount`** whether **source snapshot materialization** is required. If live sources are not required, each linked key found on the queue SHALL use **claim-only absorb**: `claimAccount`, uncorrelated/status bookkeeping, and `managedAccountInfo` without copying managed account attributes onto `attributeBag.sources`. If live sources are required, the layer SHALL materialize source snapshots for **all remaining live linked accounts** found on the queue this invocation (not only the key that tripped the flag). `claimAccount` SHALL run in both paths so Process cannot rematch those keys. The layer SHALL NOT claim first and materialize later (the Account is gone from `managedAccountsById` after claim).

Live sources are required when any of the following hold before claim: `needsRefresh` is already true; force attribute refresh is enabled; rebuild `refreshMapping`, `refreshDefinition`, or `resetDefinition` is requested; the Fusion account has at least one eligible Always recalculate Normal definition; any linked key is a new blend (`previousAccountIds` does not contain it); any previously correlated linked key on the queue has `modified` strictly newer than Fusion `modified` plus `fusionAccountRefreshThresholdInSeconds`; prune-deleted would remove a tracked key.

#### Scenario: Stale previously correlated accounts are claim-only

- **GIVEN** a Fusion account restored via `fromFusionAccount` with `modified` set
- **AND** `previousAccountIds` contains a managed account key present on the work queue
- **AND** that managed account `modified` is not newer than Fusion `modified` plus the refresh threshold
- **AND** force attribute refresh is disabled
- **AND** rebuild attribute operations do not request mapping or definition refresh
- **AND** no eligible Always recalculate Normal definition applies to the Fusion account
- **AND** prune-deleted would not remove a tracked key
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be false
- **AND** `queue.claimAccount` SHALL be invoked for that key
- **AND** `attributeBag.sources` SHALL NOT contain a newly materialized snapshot copied from that managed account’s attributes

#### Scenario: New blend materializes snapshots for the Fusion account

- **GIVEN** a Fusion account whose `previousAccountIds` does not contain a managed account key that is on the work queue
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be true
- **AND** source snapshot materialization SHALL copy that account’s attributes onto `attributeBag.sources`
- **AND** `queue.claimAccount` SHALL be invoked for that key

#### Scenario: Over-threshold modified materializes all live linked accounts on the Fusion account

- **GIVEN** a Fusion account with two previously correlated managed accounts on the work queue
- **AND** only one of them has `modified` strictly after Fusion `modified` plus the refresh threshold
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be true
- **AND** source snapshot materialization SHALL include both live linked accounts found on the queue

#### Scenario: Prune-deleted requires materializing remaining live accounts

- **GIVEN** a Fusion account whose tracked keys include one key absent from `managedAccountInventory`
- **AND** another previously correlated key is present on the work queue with stale `modified`
- **WHEN** `addManagedAccountLayer` runs with prune-deleted enabled
- **THEN** `needsRefresh` SHALL be true
- **AND** the remaining live account SHALL receive source snapshot materialization
- **AND** the missing key SHALL be pruned as today

#### Scenario: Force attribute refresh materializes before Map

- **GIVEN** a Fusion account that would otherwise qualify for claim-only absorb
- **AND** `forceAttributeRefresh` is enabled
- **WHEN** `addManagedAccountLayer` runs
- **THEN** source snapshot materialization SHALL run for live linked accounts on the queue
- **AND** those keys SHALL still be claimed

#### Scenario: Eligible Always recalculate materializes when timestamps are stale

- **GIVEN** a Fusion account that would otherwise qualify for claim-only absorb
- **AND** at least one Normal definition has Always recalculate and is eligible on that Fusion account
- **WHEN** `addManagedAccountLayer` runs
- **THEN** source snapshot materialization SHALL run so Velocity `$accounts` / `$sources` can read this run’s snapshots

### Requirement: Previous and missing managed account keys use targeted queue lookups

When `FusionLayers.addManagedAccountLayer` re-blends managed source accounts for persisted Fusion accounts, `processPreviousRunMatchedAccounts` SHALL resolve accounts by looking up each normalized key in `previousAccountIds` and `missingAccountIds` via `FusionRun.get(key)` (or equivalent O(1) queue lookup). It SHALL NOT iterate all entries in the managed-account work queue to find matching keys.

#### Scenario: Large queue with few previous keys avoids full scan

- **GIVEN** a managed-account work queue containing thousands of entries
- **AND** a Fusion account whose `previousAccountIds` contains two keys present in the queue
- **WHEN** `addManagedAccountLayer` runs during Refresh
- **THEN** exactly those two accounts SHALL be absorbed and claimed
- **AND** the implementation SHALL NOT invoke a full-queue iteration over all queue entries for this path

#### Scenario: Missing key absent from queue is skipped

- **GIVEN** a Fusion account with `missingAccountIds` containing a key not present in the work queue
- **WHEN** previous/missing re-blend runs
- **THEN** processing SHALL continue without error
- **AND** no account SHALL be absorbed for that key

#### Scenario: Uncorrelated status updates preserved for matched keys

- **GIVEN** a managed source account in the queue matching a previous-run key on a Fusion account
- **WHEN** targeted lookup absorbs the account
- **THEN** uncorrelated status and missing-account collection updates SHALL match pre-change behavior for that key
- **AND** `queue.claimAccount` SHALL be invoked for the absorbed key
