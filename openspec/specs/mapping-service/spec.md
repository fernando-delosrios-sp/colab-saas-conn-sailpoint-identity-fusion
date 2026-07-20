# mapping-service Spec

## Purpose

The map service (`src/services/mappingService/`) merges attributes from managed source accounts into the Fusion account schema using configurable merge strategies. It operates as a stateless service that receives all its input data from FusionRun.
## Requirements
### Requirement: MappingService merges managed source attributes into Fusion accounts

The MappingService SHALL provide attribute consolidation from managed source accounts into the Fusion account schema. It SHALL apply configurable merge strategies (first-found, source-specific, concatenate, distinct-list) in the ordered sequence defined by the source configuration.

#### Scenario: Attribute merged with first-found strategy
- **WHEN** MappingService.mapAttributes is called with a FusionAccount and configured source order
- **THEN** for each mapped attribute, the first non-empty value across sources in order SHALL be selected
- **AND** the result SHALL be written to fusionAccount.attributeBag.current

#### Scenario: Attribute merged with source-specific strategy
- **WHEN** an attribute map specifies a source name and merge strategy is "source"
- **THEN** only accounts from the specified source SHALL be consulted
- **AND** the first match within that source SHALL be used

#### Scenario: Identity-type accounts skip mapping
- **WHEN** a FusionAccount has type FusionAccountKind.Identity
- **THEN** mapAttributes SHALL return immediately without modifying the attribute bag

### Requirement: MappingService respects mainAccount prioritization

When the mainAccount attribute is set on a FusionAccount, MappingService SHALL prioritize that account's attribute values when resolving mappings.

#### Scenario: mainAccount value used for attribute resolution
- **GIVEN** a FusionAccount with mainAccount set to a valid managed account key
- **WHEN** mapAttributes resolves an attribute value
- **THEN** the mainAccount snapshot SHALL be checked first before falling back to source order

### Requirement: MappingService configuration is derived from attributeMaps

MappingService SHALL derive its attribute mapping configuration from the user-configured attributeMaps array and defaultAttributeMerge policy. Mapping targets SHALL include both schema-defined attributes and explicitly mapped attributes.

#### Scenario: Schema attributes are included as mapping targets
- **WHEN** MappingService builds its mapping configuration
- **THEN** every attribute in the Fusion account schema SHALL be a mapping target
- **AND** every attribute named in attributeMaps.newAttribute SHALL be a mapping target

### Requirement: MappingService is stateless

MappingService SHALL NOT hold mutable state between invocations. All configuration SHALL be set at construction time. All operations SHALL receive their input data from FusionRun.

#### Scenario: MappingService can be shared across concurrent operations
- **WHEN** two concurrent operations call MappingService.mapAttributes with different FusionRun instances
- **THEN** there SHALL be no cross-contamination of state between operations

### Requirement: MappingService utilizes shared snapshot key generator

MappingService SHALL utilize a centrally exported shared utility (`getManagedAccountSnapshotKey`) for generating snapshot keys from account attributes to avoid logic duplication across services.

#### Scenario: Mapping uses the shared snapshot key utility
- **WHEN** MappingService requires a snapshot key for a managed account
- **THEN** it invokes the exported utility rather than implementing a local fallback

