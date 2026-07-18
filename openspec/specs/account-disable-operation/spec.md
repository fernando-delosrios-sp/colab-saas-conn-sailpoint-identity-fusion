# account-disable Spec

## Purpose

The account-disable operation disables an existing account. This spec defines the contract for account disablement behavior.

## Requirements

### Requirement: Account disable deactivates account
The system SHALL disable an existing account when the account-disable operation is invoked.

#### Scenario: Successful account disablement
- **WHEN** the account-disable operation is invoked for an enabled account
- **THEN** the system SHALL disable the account and return success

#### Scenario: Account already disabled
- **WHEN** the account-disable operation is invoked for an already disabled account
- **THEN** the system SHALL return success without modification
