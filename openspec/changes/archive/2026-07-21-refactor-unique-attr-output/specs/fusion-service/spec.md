## ADDED Requirements

### Requirement: Unique attributes SHALL be generated Just-In-Time during output streaming
The system SHALL NOT eagerly filter and output Fusion accounts prior to the final output phase to bypass memory constraints. Instead, the system SHALL stream all Fusion accounts uniformly during the final output phase, evaluating and generating unique attributes Just-In-Time immediately prior to serialization. 

#### Scenario: JIT Unique Attribute Generation prevents memory accumulation
- **WHEN** the aggregation output phase iterates through Fusion accounts
- **AND** a Fusion account requires unique attribute generation
- **THEN** the system SHALL generate the unique attributes exactly before serializing the account
- **AND** the system SHALL immediately remove the serialized account from memory

#### Scenario: Single account reads preserve unique attribute state
- **WHEN** a single Fusion account is processed outside of an aggregation context (e.g. account read, dry-run)
- **THEN** the JIT output hook SHALL NOT advance unique attribute counters inappropriately
