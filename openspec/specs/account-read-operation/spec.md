# account-read Spec

## Purpose

The account-read operation reads one account by native identity. This spec defines the contract for single account retrieval behavior.

## Requirements

### Requirement: Account read retrieves account by identity
The system SHALL retrieve a single account by its native identity when the account-read operation is invoked.

#### Scenario: Successful account read
- **WHEN** the account-read operation is invoked with a valid native identity
- **THEN** the system SHALL return the account data for the specified identity

#### Scenario: Account not found
- **WHEN** the account-read operation is invoked with an invalid native identity
- **THEN** the system SHALL return an appropriate not-found response
