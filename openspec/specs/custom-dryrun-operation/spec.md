# custom-dryrun Spec

## Purpose

The custom-dryrun operation runs a no-write execution path to verify mapping and processing behavior. This spec defines the contract for dry-run validation behavior.

## Requirements

### Requirement: Dry run executes without making changes
The system SHALL execute the configured mapping and processing logic without persisting any changes when the dry-run operation is invoked.

#### Scenario: Successful dry run
- **WHEN** the dry-run operation is invoked with valid configuration
- **THEN** the system SHALL return execution results without modifying any data

#### Scenario: Dry run with validation errors
- **WHEN** the dry-run operation encounters validation errors during execution
- **THEN** the system SHALL return error details without modifying any data
