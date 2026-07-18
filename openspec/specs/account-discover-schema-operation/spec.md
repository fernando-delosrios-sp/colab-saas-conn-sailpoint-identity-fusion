# account-discover-schema Spec

## Purpose

The account-discover-schema operation returns the account schema used by ISC. This spec defines the contract for schema discovery behavior.

## Requirements

### Requirement: Schema discovery returns account schema
The system SHALL return the account schema definition when the account-discover-schema operation is invoked.

#### Scenario: Successful schema discovery
- **WHEN** the account-discover-schema operation is invoked
- **THEN** the system SHALL return the complete account schema with all attribute definitions

#### Schema discovery with custom attributes
- **WHEN** the account-discover-schema operation is invoked with custom attribute configurations
- **THEN** the system SHALL return the schema including custom attribute definitions
