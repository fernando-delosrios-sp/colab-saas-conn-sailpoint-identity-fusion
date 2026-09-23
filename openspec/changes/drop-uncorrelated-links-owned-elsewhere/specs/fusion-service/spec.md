## ADDED Requirements

### Requirement: Previous and missing keys that are foreign-owned are dropped as gone

When `FusionLayers.addManagedAccountLayer` resolves leftover `previousAccountIds` and `missingAccountIds` after identity matching for this Fusion account, it SHALL treat each **foreign-owned managed account** as gone for this Fusion account. The connector SHALL remove the key from accounts, missing-accounts, previous keys, and `managedAccountInfo` using the same bookkeeping as prune-deleted, including history and refresh/orphan semantics. It SHALL NOT absorb that managed source account into this Fusion account. It SHALL NOT `claimAccount` for that key, so the owning Fusion identity can still identity-match it. A previous or missing key whose ISC `identityId` is unset, matches this Fusion account, or belongs to an identity that is not a loaded Fusion identity SHALL keep existing uncorrelated absorb and claim behavior. Identity matching for this Fusion account’s own `identityId` SHALL remain unchanged.

#### Scenario: Queue hit owned by another Fusion identity is dropped without claim

- **GIVEN** a Fusion account whose `previousAccountIds` or `missingAccountIds` contains a managed account key
- **AND** the Fusion account has another managed account link
- **AND** that key is present on the work queue
- **AND** the managed source account’s `identityId` is a loaded Fusion identity other than this Fusion account
- **WHEN** `addManagedAccountLayer` runs
- **THEN** the key SHALL be removed from this Fusion account’s accounts, missing-accounts, and previous keys
- **AND** `needsRefresh` SHALL be true
- **AND** `queue.claimAccount` SHALL NOT be invoked for that key
- **AND** the managed source account SHALL remain on the work queue

#### Scenario: Already-claimed foreign-owned key is dropped despite inventory presence

- **GIVEN** a Fusion account whose `previousAccountIds` or `missingAccountIds` contains a managed account key
- **AND** that key is absent from the work queue
- **AND** `managedAccountInventory` still lists the key
- **AND** the inventory `identityId` is a loaded Fusion identity other than this Fusion account
- **WHEN** `addManagedAccountLayer` runs with prune-deleted enabled
- **THEN** the key SHALL be removed from this Fusion account
- **AND** the managed-origin Fusion account SHALL be marked orphan
- **AND** `needsRefresh` SHALL be false because no managed contributor remains to remap
- **AND** prune-deleted SHALL NOT keep the key solely because inventory still lists it

#### Scenario: Uncorrelated key with no other Fusion identity is still absorbed

- **GIVEN** a Fusion account whose `previousAccountIds` contains a managed account key present on the work queue
- **AND** the managed source account is not a foreign-owned managed account
- **WHEN** `addManagedAccountLayer` runs
- **THEN** the account SHALL be absorbed and claimed as in existing previous-run uncorrelated behavior

#### Scenario: This Fusion identity’s identity-matched keys are not dropped

- **GIVEN** a Fusion account whose identity id matches a managed source account on the work queue
- **AND** that key is also listed in `previousAccountIds`
- **WHEN** `addManagedAccountLayer` runs
- **THEN** identity matching SHALL absorb and claim that key for this Fusion account
- **AND** the previous/missing path SHALL NOT drop that key as foreign-owned

---

## MODIFIED Requirements

### Requirement: FusionLayers claim-only absorb skips source snapshot materialization when live sources are not required

When `FusionLayers.addManagedAccountLayer` absorbs managed accounts from the work queue, it SHALL decide **once per Fusion account before any `claimAccount`** whether **source snapshot materialization** is required. If live sources are not required, each linked key found on the queue SHALL use **claim-only absorb**: `claimAccount`, uncorrelated/status bookkeeping, and `managedAccountInfo` without copying managed account attributes onto `attributeBag.sources`. If live sources are required, the layer SHALL materialize source snapshots for **all remaining live linked accounts** found on the queue this invocation (not only the key that tripped the flag). `claimAccount` SHALL run in both paths so Process cannot rematch those keys. The layer SHALL NOT claim first and materialize later (the Account is gone from `managedAccountsById` after claim).

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

### Requirement: Previous and missing managed account keys use targeted queue lookups

When `FusionLayers.addManagedAccountLayer` re-blends managed source accounts for persisted Fusion accounts, `processPreviousRunMatchedAccounts` SHALL resolve accounts by looking up each normalized key in `previousAccountIds` and `missingAccountIds` via `FusionRun.get(key)` (or equivalent O(1) queue lookup). It SHALL NOT iterate all entries in the managed-account work queue to find matching keys. Foreign-owned managed account keys SHALL be excluded from absorb and claim on this path.

#### Scenario: Large queue with few previous keys avoids full scan

- **GIVEN** a managed-account work queue containing thousands of entries
- **AND** a Fusion account whose `previousAccountIds` contains two keys present in the queue
- **AND** neither key is a foreign-owned managed account
- **WHEN** `addManagedAccountLayer` runs during Refresh
- **THEN** exactly those two accounts SHALL be absorbed and claimed
- **AND** the implementation SHALL NOT invoke a full-queue iteration over all queue entries for this path

#### Scenario: Missing key absent from queue is skipped

- **GIVEN** a Fusion account with `missingAccountIds` containing a key not present in the work queue
- **AND** that key is not a foreign-owned managed account
- **WHEN** previous/missing re-blend runs
- **THEN** processing SHALL continue without error
- **AND** no account SHALL be absorbed for that key

#### Scenario: Uncorrelated status updates preserved for matched keys

- **GIVEN** a managed source account in the queue matching a previous-run key on a Fusion account
- **AND** that account is not a foreign-owned managed account
- **WHEN** targeted lookup absorbs the account
- **THEN** uncorrelated status and missing-account collection updates SHALL match pre-change behavior for that key
- **AND** `queue.claimAccount` SHALL be invoked for the absorbed key
