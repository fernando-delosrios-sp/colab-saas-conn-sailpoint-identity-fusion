## ADDED Requirements

### Requirement: Glossary defines source snapshot materialization and claim-only absorb

The ubiquitous-language glossary SHALL define **Source snapshot materialization** and **Claim-only absorb** as FusionLayers managed-account layer terms. Documentation and specs SHALL NOT call claim-only absorb “skip Refresh” or “skip blend” when report fusionBlends or Map merge is meant.

#### Scenario: Source snapshot materialization entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up copying managed source attributes onto the Fusion account for Map and Velocity
- **THEN** a **Source snapshot materialization** entry SHALL define it as copying a managed source account’s attributes onto `attributeBag.sources` during FusionLayers absorb so Map and Velocity `$accounts` / `$sources` can read this run’s live snapshots

#### Scenario: Claim-only absorb entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up Refresh work-queue depletion without copying attributes
- **THEN** a **Claim-only absorb** entry SHALL define it as absorbing a work-queue managed account by claiming it and updating Fusion account bookkeeping without source snapshot materialization
