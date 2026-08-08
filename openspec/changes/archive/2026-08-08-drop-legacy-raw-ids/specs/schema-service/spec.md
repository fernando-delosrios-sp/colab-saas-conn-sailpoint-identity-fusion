# schema-service Delta Spec

## ADDED Requirements

### Requirement: Standard schema attribute descriptions require composite managed account keys

The `fusionAccountSchemaAttributes` descriptions for `accounts`, `missing-accounts`, and `originAccount` MUST state that managed source account references use composite managed account keys (`sourceId::nativeIdentity`) only. They MUST NOT describe legacy raw ID or backwards-compatibility support.

#### Scenario: Accounts attribute description is composite-only

- **WHEN** a developer reads the `accounts` entry in `fusionAccountSchemaAttributes`
- **THEN** the description SHALL reference composite managed account keys
- **AND** SHALL NOT mention legacy raw IDs or backwards compatibility

#### Scenario: Missing-accounts attribute description is composite-only

- **WHEN** a developer reads the `missing-accounts` entry in `fusionAccountSchemaAttributes`
- **THEN** the description SHALL reference composite managed account keys
- **AND** SHALL NOT mention legacy raw IDs or backwards compatibility

#### Scenario: OriginAccount attribute description distinguishes identity ID from composite key

- **WHEN** a developer reads the `originAccount` entry in `fusionAccountSchemaAttributes`
- **THEN** the description SHALL state that identity-origin accounts store an identity ID
- **AND** managed-source origins SHALL require a composite managed account key
- **AND** SHALL NOT mention legacy managed source account ID backwards compatibility
