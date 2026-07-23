## ADDED Requirements

### Requirement: The SDK adapter MUST configure bounded HTTPS socket pool limits

`SdkApiAdapter` SHALL inject an `https.Agent` into the SailPoint SDK `Configuration` with HTTP keep-alive enabled and explicit connection pool bounds. The agent MUST set `keepAlive: true`, `keepAliveMsecs: 30000`, `maxSockets: 50`, `maxFreeSockets: 10`, and `timeout: 60000`. All SDK API instances MUST share this single agent via `baseOptions.httpsAgent`.

#### Scenario: SdkApiAdapter constructs a bounded keep-alive agent

- **GIVEN** a `FusionConfig` with a valid ISC base URL
- **WHEN** `SdkApiAdapter` is instantiated
- **THEN** the SDK `Configuration` SHALL include an `httpsAgent` with `keepAlive` enabled
- **AND** the agent SHALL have `maxSockets` set to 50
- **AND** the agent SHALL have `maxFreeSockets` set to 10
- **AND** the agent SHALL have `keepAliveMsecs` set to 30000
- **AND** the agent SHALL have `timeout` set to 60000

#### Scenario: All SDK API calls reuse the shared bounded agent

- **GIVEN** an instantiated `SdkApiAdapter`
- **WHEN** any lazy-loaded SDK API getter (e.g. `accountsApi`, `searchApi`) is accessed
- **THEN** the underlying HTTP client SHALL use the same shared `httpsAgent` from `Configuration.baseOptions`
- **AND** outbound requests SHALL continue to route through the client service queue unchanged
