# account-update Spec

## Purpose

The account-update operation applies provisioning updates to an existing account. This spec defines the contract for account update behavior.

## Requirements

### Requirement: Account update modifies existing account
The system SHALL apply updates to an existing account when the account-update operation is invoked with valid update data.

#### Scenario: Successful account update
- **WHEN** the account-update operation is invoked with valid update data for an existing account
- **THEN** the system SHALL apply the updates and return the updated account data

#### Scenario: Account update for non-existent account
- **WHEN** the account-update operation is invoked for a non-existent account
- **THEN** the system SHALL return an appropriate not-found response
