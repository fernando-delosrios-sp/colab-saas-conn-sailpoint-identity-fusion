# fusion-service Delta Spec

## ADDED Requirements

### Requirement: Persisted account reference collections MUST use composite managed account keys

When reconstructing a Fusion account from persisted platform attributes, values in the `accounts` and `missing-accounts` collections that represent managed source accounts MUST be valid composite managed account keys (`sourceId::nativeIdentity`). Non-composite values SHALL NOT be retained in internal account reference sets and SHALL NOT be used as lookup keys in the work queue or managed account inventory.

#### Scenario: Non-composite account reference is dropped during reconstruction

- **GIVEN** a persisted Fusion account with `accounts: ["legacy-uuid-only", "src-a::user-1"]`
- **WHEN** the connector reconstructs the Fusion account via `FusionAccount.fromFusionAccount`
- **THEN** the internal account reference set SHALL contain only `src-a::user-1`
- **AND** `legacy-uuid-only` SHALL NOT appear in internal collections or subsequent lookups

#### Scenario: Non-composite missing-account reference is dropped during reconstruction

- **GIVEN** a persisted Fusion account with `missing-accounts: ["legacy-uuid-only"]`
- **WHEN** the connector reconstructs the Fusion account
- **THEN** the internal missing-account reference set SHALL be empty
- **AND** `legacy-uuid-only` SHALL NOT be used for correlation or managed account fetch

### Requirement: originAccount MUST follow origin-type key rules

When loading persisted `originAccount` metadata, the connector SHALL accept a plain identity ID only when the account origin is the Identities source. When the origin is a managed source, `originAccount` MUST be a valid composite managed account key. Non-composite managed-source origin values SHALL NOT be retained as origin account identifiers.

#### Scenario: Identity-origin account retains plain identity ID

- **GIVEN** a persisted Fusion account with `originSource: Identities` and `originAccount: "<identity-uuid>"`
- **WHEN** the connector loads origin metadata
- **THEN** `originAccount` SHALL be set to the identity UUID

#### Scenario: Managed-origin account requires composite originAccount

- **GIVEN** a persisted Fusion account with `originSource: "Workday"` and `originAccount: "src-a::user-1"`
- **WHEN** the connector loads origin metadata
- **THEN** `originAccount` SHALL be set to `src-a::user-1`

#### Scenario: Managed-origin account rejects raw originAccount

- **GIVEN** a persisted Fusion account with `originSource: "Workday"` and `originAccount: "legacy-uuid-only"`
- **WHEN** the connector loads origin metadata
- **THEN** `originAccount` SHALL NOT be set to the raw UUID
- **AND** the invalid value SHALL NOT be used as a managed account lookup key
