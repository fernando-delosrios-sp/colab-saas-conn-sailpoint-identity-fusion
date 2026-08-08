## MODIFIED Requirements

### Requirement: The source service MUST resolve accounts using the source's configured filters

The source service MUST resolve accounts from a managed source by applying configured filter expressions at fetch time. **Accounts API filter** (`accountFilter`) SHALL be composed into the ISC `listAccounts` `filters` query (server-side). **Accounts JMESPath filter** (`accountJmespathFilter`) SHALL be applied client-side to each fetched account page before accounts are registered on FusionRun. Source-specific reverse-correlation errors MUST be surfaced using the dedicated error vocabulary in `sourceReverseCorrelationErrors.ts` so the rest of the connector can distinguish them from generic upstream failures.

#### Scenario: A jmespath filter narrows the resolved account set

- **REMOVED** — superseded by **Accounts API filter narrows the resolved account set** and **Accounts JMESPath filter narrows each fetched page**. Prior scenario mislabeled ISC search syntax (`attributes.active eq true`) as JMESPath.

#### Scenario: Accounts API filter narrows the resolved account set

- **GIVEN** a managed source with Accounts API filter `attributes.active eq true`
- **WHEN** the source service fetches accounts for the source via `listAccounts`
- **THEN** the composed `filters` parameter SHALL include the configured filter clause
- **AND** only accounts returned by the ISC Accounts API for that query SHALL be registered on FusionRun
- **AND** accounts excluded by the server-side filter SHALL NOT be surfaced to the operations layer

#### Scenario: Accounts JMESPath filter narrows each fetched page

- **GIVEN** a managed source with Accounts JMESPath filter that selects a subset of accounts from a page
- **WHEN** the source service processes a page of accounts returned by the ISC Accounts API
- **THEN** only accounts retained by the JMESPath expression SHALL be registered on FusionRun
- **AND** accounts removed by the JMESPath filter SHALL NOT be surfaced to the operations layer

#### Scenario: A reverse-correlation failure surfaces a typed error

- **GIVEN** the source service cannot reverse-correlate a result to an account
- **WHEN** the operation handles the failure
- **THEN** the error is one of the typed entries from `sourceReverseCorrelationErrors.ts`
- **AND** the error is distinguishable from generic upstream `ConnectorError`s
