## ADDED Requirements

### Requirement: Identity Document pruning on ingest

IdentityService SHALL prune incoming `IdentityDocument` payloads on page arrival during bulk ingestion and single-identity hydration by filtering `identity.attributes` against the referenced attribute set and filtering `identity.accounts` to only configured Fusion and managed sources.

#### Scenario: Unreferenced identity attributes are dropped on page arrival

- **GIVEN** an incoming page of `IdentityDocument` instances from the Search API
- **AND** a referenced attribute set configured for the aggregation run
- **WHEN** `IdentityService.fetchIdentities` ingests each identity
- **THEN** attributes not present in the referenced attribute set or core identity fields SHALL be pruned from `identity.attributes`
- **AND** core identity fields (`displayName`, `email`, `name`, `id`, `firstname`, `lastname`) SHALL be preserved

#### Scenario: Non-managed linked accounts are excluded from identity document

- **GIVEN** an `IdentityDocument` containing linked accounts across multiple sources
- **WHEN** the identity is ingested by `IdentityService`
- **THEN** accounts belonging to sources other than the Fusion source or configured managed sources SHALL be removed from `identity.accounts`
- **AND** retained accounts SHALL retain only essential fields (`id`, `nativeIdentity`, `name`, `disabled`, `source`)

#### Scenario: On-demand identity hydration applies pruning

- **GIVEN** an identity fetched on-demand via `IdentityService.fetchIdentityById`
- **WHEN** the identity document is received from the API
- **THEN** the same attribute pruning and linked account filtering SHALL be applied before the document is cached or returned
