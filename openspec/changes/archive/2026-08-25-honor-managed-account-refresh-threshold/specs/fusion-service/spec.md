## ADDED Requirements

### Requirement: Managed-account timestamp refresh uses Fusion account modified

When `FusionLayers.setManagedAccount` absorbs a managed account that is already in `previousAccountIds`, it SHALL set `needsRefresh` from timestamps only when the managed account `modified` is strictly newer than the Fusion account `modified` plus `fusionAccountRefreshThresholdInSeconds`. It SHALL NOT treat a missing Fusion `modified` as epoch 0. A managed account whose key is not in `previousAccountIds` SHALL still set `needsRefresh` (new blend). Prune-deleted and identity-layer rules are unchanged.

#### Scenario: Previously correlated stale managed account does not force refresh

- **GIVEN** a Fusion account restored via `fromFusionAccount` with `modified` set
- **AND** `previousAccountIds` contains a managed account key that is present on the work queue
- **AND** that managed account `modified` is older than the Fusion account `modified`
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be false
- **AND** the managed account SHALL still be blended and claimed from the work queue

#### Scenario: Managed account newer than Fusion modified beyond the threshold forces refresh

- **GIVEN** a Fusion account with `modified` set and a previously correlated managed account on the work queue
- **AND** the managed account `modified` is strictly after Fusion `modified` plus `fusionAccountRefreshThresholdInSeconds`
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be true

#### Scenario: Managed account newer than Fusion modified within the threshold does not force refresh

- **GIVEN** a Fusion account with `modified` set and a previously correlated managed account on the work queue
- **AND** the managed account `modified` is after Fusion `modified` but not after Fusion `modified` plus `fusionAccountRefreshThresholdInSeconds`
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be false

#### Scenario: New blend still forces refresh

- **GIVEN** a Fusion account whose `previousAccountIds` does not contain the managed account key
- **AND** that managed account is on the work queue (for example via identity index)
- **WHEN** `addManagedAccountLayer` runs
- **THEN** `needsRefresh` SHALL be true

#### Scenario: Missing Fusion modified does not use epoch as the refresh reference

- **GIVEN** a Fusion account with no `modified` value
- **AND** a previously correlated managed account on the work queue with a real ISO `modified`
- **WHEN** `addManagedAccountLayer` runs
- **THEN** the timestamp check SHALL NOT set `needsRefresh`
- **AND** `needsRefresh` SHALL remain false unless a new-blend or prune-deleted rule applies
