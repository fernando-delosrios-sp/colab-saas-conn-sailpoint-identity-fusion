## ADDED Requirements

### Requirement: Configuration reference SHALL document External Settings section

The generated Configuration reference (`docs/configuration/advanced.md` or equivalent) MUST document the External Settings section with fields: `externalProcessingEnabled`, `externalTargetUrl`, `externalTargetPassword`, `externalProxyEnabled`, `externalRecordingEnabled`, `recordingName`, `externalLoggingEnabled`, and `externalLoggingLevel`. The reference MUST NOT document removed Proxy Settings keys (`proxyEnabled`, `proxyUrl`, `proxyPassword`) or Developer Settings external logging keys (`externalLoggingUrl`).

#### Scenario: Doc generation after connector-spec update

- **GIVEN** `connector-spec.json` defines External Settings under Advanced Settings
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the Configuration reference MUST include External Settings field entries
- **AND** MUST NOT list `proxyEnabled` or `externalLoggingUrl` as active fields

### Requirement: Proxy mode and observability guides SHALL describe External Settings behavior

Technical reference and Use guide pages for proxy mode and connection/observability tuning MUST describe the unified External Settings model, including: gateway toggle semantics, shared target URL/password, recording name when proxy and recording are enabled, and external logging behavior split (HTTP from ISC when proxy off; disk on proxy server when proxy on).

#### Scenario: Proxy mode reference reflects External Settings

- **GIVEN** the documentation restructure for External Settings is complete
- **WHEN** a reader opens `docs/reference/proxy-mode.md`
- **THEN** the page MUST reference External Settings (not Proxy Settings) for ISC configuration
- **AND** MUST explain that external logging on a proxy server writes to `LOG_FILE` or the default disk path
