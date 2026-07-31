## MODIFIED Requirements

### Requirement: Proxy mode and observability guides SHALL describe External Settings behavior

Technical reference and Use guide pages for proxy mode and connection/observability tuning MUST describe the unified External Settings model, including: gateway toggle semantics, shared target URL/password, recording name when proxy and recording are enabled, and external logging behavior split (HTTP from ISC when proxy off; disk on proxy server when proxy on). Documentation MUST state that default disk paths are tenant-scoped: external logs under `logs/<tenant>/fusion-{YYYYMMDD}.log` and chain recordings under `recordings/<tenant>/{chainName}/`, where `<tenant>` is derived from connection `baseurl`. Documentation MUST note that explicit `LOG_FILE` overrides the default log path without tenant injection.

#### Scenario: Proxy mode reference reflects External Settings

- **GIVEN** the documentation restructure for External Settings is complete
- **WHEN** a reader opens `docs/reference/proxy-mode.md`
- **THEN** the page MUST reference External Settings (not Proxy Settings) for ISC configuration
- **AND** MUST explain that external logging on a proxy server writes to `LOG_FILE` or the default tenant-scoped disk path `logs/<tenant>/fusion-{YYYYMMDD}.log`

#### Scenario: Chain recording reference documents tenant-scoped layout

- **GIVEN** tenant-scoped recording paths are implemented
- **WHEN** a reader opens `docs/reference/chain-recording.md`
- **THEN** the page MUST document that chain artifacts are written under `recordings/<tenant>/{chainName}/`
- **AND** MUST explain that `<tenant>` is derived from connection `baseurl`

#### Scenario: Observability tuning guide documents tenant isolation

- **GIVEN** tenant-scoped log paths are implemented
- **WHEN** a reader opens the connection and observability tuning Use guide
- **THEN** the page MUST describe default external log location as `logs/<tenant>/fusion-{YYYYMMDD}.log` on the proxy server
- **AND** MUST mention `unknown-tenant` fallback when `baseurl` is unavailable
