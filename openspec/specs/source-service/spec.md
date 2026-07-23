# source-service Spec

## Purpose

The source service (`src/services/sourceService/`) is the connector's read/write adapter for managed sources. It wraps the SailPoint API client's `AccountV2025` resource, provides jmespath-based account filtering, manages the source-specific reverse-correlation error vocabulary, and exposes the per-source type definitions. This spec defines the contract for how the connector resolves accounts from a source, applies the configured filters, and surfaces source-specific failure modes.

## Requirements

### Requirement: The source service MUST resolve accounts using the source's configured filters

The source service MUST resolve accounts from a managed source by applying the source-specific filter expression via jmespath, then expose the resulting account list to the operations layer. Source-specific reverse-correlation errors MUST be surfaced using the dedicated error vocabulary in `sourceReverseCorrelationErrors.ts` so the rest of the connector can distinguish them from generic upstream failures.

#### Scenario: A jmespath filter narrows the resolved account set

- **GIVEN** a source with filter `attributes.active eq true`
- **WHEN** the source service resolves accounts for the source
- **THEN** only accounts for which the filter evaluates to `true` are returned
- **AND** accounts that fail the filter are not surfaced to the operations layer

#### Scenario: A reverse-correlation failure surfaces a typed error

- **GIVEN** the source service cannot reverse-correlate a result to an account
- **WHEN** the operation handles the failure
- **THEN** the error is one of the typed entries from `sourceReverseCorrelationErrors.ts`
- **AND** the error is distinguishable from generic upstream `ConnectorError`s

### Requirement: SourceService writes account data to FusionRun

SourceService SHALL write all account inventory data to FusionRun rather than maintaining service-local copies. SourceService SHALL NOT hold its own `managedAccountsAllById` or `managedAccountsByIdentityId` fields. Each fetched managed account SHALL be registered via `run.setManagedAccount`, which SHALL populate both the work queue and the lightweight inventory.

#### Scenario: Fetching managed accounts writes to FusionRun
- **WHEN** SourceService.fetchManagedAccounts is called for a managed source
- **THEN** each fetched account SHALL be written via `run.setManagedAccount(key, account)`
- **AND** `run.managedAccountInventory` SHALL contain metadata for every loaded key
- **AND** there SHALL be no service-local managedAccountsAllById field on SourceService
- **AND** SourceService SHALL NOT call a separate snapshot-map setter after `setManagedAccount`

#### Scenario: SourceService has no dead inventory fields
- **WHEN** code review inspects SourceService's class body
- **THEN** there SHALL be no `managedAccountsByIdentityId` or `managedAccountsAllById` fields declared on SourceService
- **AND** any reference to `this.managedAccountsByIdentityId` SHALL be replaced with `run.managedAccountsByIdentityId`

#### Scenario: resolveIscAccountIdForManagedKey uses inventory accessors
- **WHEN** SourceService.resolveIscAccountIdForManagedKey is called for a managed account key
- **THEN** it SHALL prefer the work queue entry when present
- **AND** it SHALL fall back to `run.getManagedAccountInfo(key)?.id` when the key is not in the work queue
- **AND** it SHALL NOT read from `managedAccountsAllById`

