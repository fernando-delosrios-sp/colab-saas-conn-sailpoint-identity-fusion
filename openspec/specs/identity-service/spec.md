# identity-service Spec

## Purpose

The identity service (`src/services/identityService.ts`) is the connector's read-side adapter for SailPoint identities. It wraps the SailPoint API client's `AccountsApi` and `Search` resources and exposes identity-document operations used by correlation, change-detection, and the report operation. This spec defines the contract for how the connector searches, reads, and resolves identities on the upstream side.

## Requirements



### Requirement: Identity-origin Fusion accounts become orphan when origin identity leaves scope

A Fusion account created from an ISC identity MUST be considered orphan when it has no managed source accounts and its origin identity is not present in the configured identity scope.

Feature: Identity-origin orphan detection

#### Scenario: Identity-origin account with origin identity in scope and no managed accounts remains active
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is present in the configured identity scope
- **AND** the Fusion account has no managed source accounts
- **WHEN** the aggregation processes the account
- **THEN** the account is not marked `orphan`
- **AND** the account is emitted in the output

#### Scenario: Identity-origin account with origin identity removed from scope becomes orphan
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the Fusion account has no managed source accounts
- **WHEN** the aggregation processes the account
- **THEN** the account is marked `orphan`
- **AND** the account retains the `baseline` status

#### Scenario: Identity-origin account with managed accounts is not orphan even when origin identity is out of scope
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the Fusion account still has managed source accounts
- **WHEN** the aggregation processes the account
- **THEN** the account is not marked `orphan`

#### Scenario: Managed-origin account without managed accounts still becomes orphan
- **GIVEN** a Fusion account was created from a managed source account
- **AND** the account has no managed source accounts left
- **WHEN** the aggregation processes the account
- **THEN** the account is marked `orphan`

#### Scenario: Single-account read detects out-of-scope origin identity
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the account has no managed source accounts
- **WHEN** an `accountRead` operation rebuilds the account
- **THEN** the account is marked `orphan`
- **AND** the returned ISC account includes the orphan status
- **AND** `deleteEmpty` does not suppress single-account read output (it applies only when aggregation emits accounts)

#### Scenario: deleteEmpty filters identity-origin orphans from aggregation output
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the account has no managed source accounts
- **AND** `deleteEmpty` is enabled
- **WHEN** the aggregation emits accounts
- **THEN** the account is not sent to the platform


