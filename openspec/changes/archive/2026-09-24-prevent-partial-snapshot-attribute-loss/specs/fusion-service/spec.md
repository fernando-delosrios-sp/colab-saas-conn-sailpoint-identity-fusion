## ADDED Requirements

### Requirement: FusionLayers rematerializes linked snapshots from claimed account retention

When `FusionLayers.addManagedAccountLayer` determines that live sources are required, it SHALL materialize source snapshots for every live linked managed account key that still has attribute bodies available this run: first from the work queue when present, otherwise from **claimed account retention** for keys claimed earlier in the same run. Rematerialization SHALL run before Map and Define for that Fusion account (including `assembleAccount` re-entry for authorized or automatic merges). Keys never loaded this run and absent from retention SHALL remain without a new snapshot. Retention-backed rematerialization SHALL NOT re-queue keys onto the Match work queue.

#### Scenario: Prior claim-only origin rematerializes when a new blend requires live sources

- **GIVEN** a Fusion account whose origin managed account key was claim-only absorbed earlier in the same run
- **AND** claimed account retention still holds that origin account’s attributes
- **AND** a different managed account key on the work queue is a new blend for that Fusion account
- **WHEN** `addManagedAccountLayer` runs because live sources are required
- **THEN** `attributeBag.sources` SHALL include a materialized snapshot for the new blend
- **AND** `attributeBag.sources` SHALL include a rematerialized snapshot for the previously claim-only origin key
- **AND** the origin key SHALL NOT reappear on the Match work queue

#### Scenario: Authorized merge onto a claim-only-preprocessed Fusion account rematerializes linked keys

- **GIVEN** a Fusion account already processed with claim-only absorb for its linked keys
- **AND** an authorized or automatic merge decision blends a new managed account onto that Fusion account via `assembleAccount`
- **WHEN** live sources become required for that layer invocation
- **THEN** previously claim-only linked keys present in claimed account retention SHALL be rematerialized onto `attributeBag.sources` before Map and Define

#### Scenario: Missing retention leaves only queue-backed snapshots

- **GIVEN** live sources are required
- **AND** a linked key is absent from both the work queue and claimed account retention
- **WHEN** `addManagedAccountLayer` runs
- **THEN** that key SHALL NOT receive a newly materialized snapshot from this path
- **AND** other linked keys that are available SHALL still materialize

---

## MODIFIED Requirements

### Requirement: FusionLayers claim-only absorb skips source snapshot materialization when live sources are not required

When `FusionLayers.addManagedAccountLayer` absorbs managed accounts from the work queue, it SHALL decide **once per Fusion account before any `claimAccount` in that layer invocation** whether **source snapshot materialization** is required. If live sources are not required, each linked key found on the queue SHALL use **claim-only absorb**: `claimAccount`, uncorrelated/status bookkeeping, and `managedAccountInfo` without copying managed account attributes onto `attributeBag.sources`. If live sources are required, the layer SHALL materialize source snapshots for **all live linked accounts** whose attribute bodies are available this run — from the work queue and, when a key was claimed earlier in the same run, from **claimed account retention** (not only keys still on the queue). `claimAccount` SHALL run for work-queue keys in both paths so Process cannot rematch those keys. The layer SHALL NOT expect already-claimed keys to still sit in `managedAccountsById`; rematerialization from claimed account retention is the supported recovery path.

Live sources are required when any of the following hold before claim: `needsRefresh` is already true; force attribute refresh is enabled; rebuild `refreshMapping`, `refreshDefinition`, or `resetDefinition` is requested; the Fusion account has at least one eligible Always recalculate Normal definition; any linked key is a new blend (`previousAccountIds` does not contain it); any previously correlated linked key on the queue has `modified` strictly newer than Fusion `modified` plus `fusionAccountRefreshThresholdInSeconds`; prune-deleted would remove a tracked key; a previous or missing key is a **foreign-owned managed account** that this Fusion account will drop.

#### Scenario: Stale previously correlated accounts are claim-only

- **GIVEN** a Fusion account restored via `fromFusionAccount` with `modified` set
- **AND** `previousAccountIds` contains a managed account key present on the work queue
- **AND** that managed account `modified` is not newer than Fusion `modified` plus the refresh threshold
- **AND** force attribute refresh is disabled
- **AND** rebuild attribute operations do not request mapping or definition refresh
- **AND** no eligible Always recalculate Normal definition applies to the Fusion account
- **AND** prune-deleted would not remove a tracked key
- **AND** no previous or missing key is a foreign-owned managed account
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be false
- **AND** `queue.claimAccount` SHALL be invoked for that key
- **AND** `attributeBag.sources` SHALL NOT contain a newly materialized snapshot copied from that managed account’s attributes
- **AND** claimed account retention SHALL hold that account’s attributes after claim

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

#### Scenario: Foreign-owned drop requires materializing remaining live accounts

- **GIVEN** a Fusion account whose tracked keys include one foreign-owned managed account key
- **AND** another previously correlated key is present on the work queue with stale `modified`
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be true
- **AND** the remaining live account SHALL receive source snapshot materialization
- **AND** the foreign-owned key SHALL be dropped without claim

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

#### Scenario: New blend rematerializes a previously claim-only sibling from retention

- **GIVEN** a Fusion account that claim-only absorbed linked key A earlier in the same run
- **AND** claimed account retention holds key A’s attributes
- **AND** key B is a new blend on the work queue for that Fusion account
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be true
- **AND** source snapshot materialization SHALL include key B from the work queue
- **AND** source snapshot materialization SHALL include key A from claimed account retention
