# Identity Hydration

## ADDED Requirements

### Requirement: Correlated identities are hydrated before the managed-account sweep

The connector SHALL ensure that the identity correlated to each fetched managed source account is present in the run-scoped identity cache before any Fusion account derived from that managed account is serialized.

#### Scenario: Managed account correlated to an identity outside the configured scope

- **WHEN** a managed source account fetched during aggregation has a non-empty `identityId`
- **AND** the identity is not in the run-scoped identity cache after the configured `identityScopeQuery` fetch
- **THEN** the connector SHALL hydrate the identity by id
- **AND** it SHALL apply the identity layer to the corresponding Fusion account before `getISCAccount` serializes it

#### Scenario: Multiple managed accounts correlated to the same identity

- **WHEN** two or more fetched managed accounts share the same `identityId`
- **THEN** the connector SHALL hydrate the identity once
- **AND** it SHALL apply the identity layer to each affected Fusion account

#### Scenario: Correlated identity is protected

- **WHEN** a hydrated identity is flagged as `protected`
- **THEN** the connector SHALL NOT apply the identity layer to the corresponding Fusion account

#### Scenario: No managed account has a correlated identity

- **WHEN** no fetched managed account has a non-empty `identityId`
- **THEN** the connector SHALL NOT perform any additional identity hydration
- **AND** it SHALL NOT add the identity layer to any Fusion account

#### Scenario: Hydration query length is bounded

- **WHEN** the connector hydrates correlated identities
- **THEN** it SHALL split the identity-id set into chunks of no more than 50 ids per query
- **AND** it SHALL execute the chunked queries in parallel with per-chunk error isolation
