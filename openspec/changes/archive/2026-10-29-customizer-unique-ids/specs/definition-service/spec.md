# definition-service Spec

## ADDED Requirements

### Requirement: DefinitionService logs customizer unique index loading metrics

When initialized with a customizer index directory, DefinitionService (or its backing CustomizerValueStore) SHALL emit structured log messages detailing the loaded customizer directory, each loaded attribute name, the count of unique values loaded per attribute, and the total load duration in milliseconds.

#### Scenario: Logging customizer index loading details
- **GIVEN** a valid customizer index directory containing one or more `.bin` index files
- **WHEN** DefinitionService initializes the CustomizerValueStore
- **THEN** an informational or detail log SHALL record the directory path, the attribute names loaded, and the count of unique values for each attribute
- **AND** the load operation timing SHALL be tracked and logged

#### Scenario: Logging when customizer directory is absent
- **GIVEN** an aggregation run where no customizer directory is provided in command input
- **WHEN** DefinitionService initializes
- **THEN** it SHALL proceed without error and log at debug level that no customizer unique value store was attached

---

## MODIFIED Requirements

### Requirement: DefinitionService manages unique value registries

DefinitionService SHALL maintain per-attribute sets of registered unique values to prevent collisions. It SHALL provide register and unregister operations for lifecycle management. When a `CustomizerValueStore` is attached, DefinitionService SHALL also reject candidate unique values that match any pre-compiled value in the customizer store for that attribute.

#### Scenario: Unique values registered after generation
- **WHEN** a unique attribute value is successfully generated
- **THEN** the value SHALL be added to the registered set for that attribute

#### Scenario: Unique values unregistered on account removal
- **WHEN** unregisterUniqueAttributes is called for a FusionAccount
- **THEN** all unique values owned by that account SHALL be removed from registered sets

#### Scenario: Candidate value rejected when matching customizer-provided unique value
- **GIVEN** a CustomizerValueStore loaded with a reserved value for attribute "sAMAccountName"
- **WHEN** DefinitionService evaluates whether candidate value "jdoe" is unique for "sAMAccountName"
- **THEN** it SHALL check CustomizerValueStore for "jdoe"
- **AND** if present, it SHALL report the candidate value as not unique without allocating strings on the heap
