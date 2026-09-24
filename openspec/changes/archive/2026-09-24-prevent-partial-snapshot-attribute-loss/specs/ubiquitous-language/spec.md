## ADDED Requirements

### Requirement: Glossary defines designated snapshot unavailable and claimed account retention

The ubiquitous-language glossary SHALL define **Designated snapshot unavailable** and **Claimed account retention** as Map / FusionRun terms. Documentation and specs SHALL NOT use “vanished snapshot key” for an unloaded designated snapshot, and SHALL NOT call claimed account retention a second Match work queue or confuse it with lightweight `managedAccountInventory`.

#### Scenario: Designated snapshot unavailable entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up Main account or Origin account merge when the chosen snapshot was not loaded
- **THEN** a **Designated snapshot unavailable** entry SHALL define it as a Main account or Origin account merge whose chosen snapshot key is not present in this invocation’s `attributeBag.sources` (or per-invocation snapshot index) at all
- **AND** it SHALL state that this is distinct from a snapshot that is present but lacks the mapped attribute
- **AND** it SHALL NOT use “vanished snapshot key” as a synonym

#### Scenario: Claimed account retention entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up keeping managed account attributes after work-queue claim
- **THEN** a **Claimed account retention** entry SHALL define it as keeping managed account attribute bodies after `claimAccount` removes them from the work queue, long enough that mid-run rematerialization can copy them onto `attributeBag.sources`
- **AND** it SHALL NOT call retention a Match work queue
- **AND** it SHALL NOT equate retention with metadata-only inventory

---

## MODIFIED Requirements

### Requirement: Glossary defines source snapshot materialization and claim-only absorb

The ubiquitous-language glossary SHALL define **Source snapshot materialization** and **Claim-only absorb** as FusionLayers managed-account layer terms. Documentation and specs SHALL NOT call claim-only absorb “skip Refresh” or “skip blend” when report fusionBlends or Map merge is meant. The glossary SHALL state that claim-only absorb still populates **claimed account retention** so a later same-run rematerialization can recover attribute bodies after the work-queue entry is gone.

#### Scenario: Source snapshot materialization entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up copying managed source attributes onto the Fusion account for Map and Velocity
- **THEN** a **Source snapshot materialization** entry SHALL define it as copying a managed source account’s attributes onto `attributeBag.sources` during FusionLayers absorb so Map and Velocity `$accounts` / `$sources` can read this run’s live snapshots
- **AND** it SHALL state that rematerialization MAY copy from claimed account retention for keys claimed earlier in the same run

#### Scenario: Claim-only absorb entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up Refresh work-queue depletion without copying attributes onto `attributeBag.sources`
- **THEN** a **Claim-only absorb** entry SHALL define it as absorbing a work-queue managed account by claiming it and updating Fusion account bookkeeping without source snapshot materialization onto `attributeBag.sources`
- **AND** it SHALL state that attribute bodies remain available via claimed account retention for possible mid-run rematerialization
