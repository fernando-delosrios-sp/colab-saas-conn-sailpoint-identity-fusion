## MODIFIED Requirements

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

SourceService SHALL write all account inventory data to FusionRun rather than maintaining service-local copies. SourceService SHALL NOT hold its own `managedAccountsAllById` or `managedAccountsByIdentityId` fields.

#### Scenario: Fetching managed accounts writes to FusionRun
- **WHEN** SourceService.fetchManagedAccounts is called for a managed source
- **THEN** all fetched accounts SHALL be written to run.managedAccountsAllById
- **AND** there SHALL be no service-local managedAccountsAllById field on SourceService

#### Scenario: SourceService has no dead inventory fields
- **WHEN** code review inspects SourceService's class body
- **THEN** there SHALL be no `managedAccountsByIdentityId` or `managedAccountsAllById` fields declared on SourceService
- **AND** any reference to `this.managedAccountsByIdentityId` SHALL be replaced with `run.managedAccountsByIdentityId`

## REMOVED Requirements

None.
