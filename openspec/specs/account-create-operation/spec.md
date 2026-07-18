# account-create Spec

## Purpose

The account-create operation creates a managed account when provisioning is enabled. This spec defines the contract for account creation behavior.

## Requirements

### Requirement: Account create provisions new account
The system SHALL create a new managed account when the account-create operation is invoked with valid account data.

#### Scenario: Successful account creation
- **WHEN** the account-create operation is invoked with valid account data
- **THEN** the system SHALL create the account and return the created account data

#### Scenario: Account creation with validation errors
- **WHEN** the account-create operation is invoked with invalid account data
- **THEN** the system SHALL return validation errors without creating the account
