## MODIFIED Requirements

### Requirement: Proxy mode and observability guides SHALL describe External Settings behavior

Technical reference and Use guide pages for proxy mode and connection/observability tuning MUST describe the unified External Settings model, including: gateway toggle semantics, shared target URL/password, recording name when proxy and recording are enabled, and external logging behavior split (HTTP from ISC when proxy off; disk on proxy server when proxy on). Documentation MUST state that default disk paths are tenant-scoped: external logs under `logs/<tenant>/fusion-{YYYYMMDD}.log` and scenario recordings under `recordings/<tenant>/{scenarioName}/`, where `<tenant>` is derived from connection `baseurl`. Documentation MUST note that explicit `LOG_FILE` overrides the default log path without tenant injection. Scenario capture MUST be documented as an External Settings configuration workflow, not a separate npm record run mode.

#### Scenario: Proxy mode reference reflects External Settings

- **GIVEN** the documentation restructure for External Settings is complete
- **WHEN** a reader opens `docs/reference/proxy-mode.md`
- **THEN** the page MUST reference External Settings (not Proxy Settings) for ISC configuration
- **AND** MUST explain that external logging on a proxy server writes to `LOG_FILE` or the default tenant-scoped disk path `logs/<tenant>/fusion-{YYYYMMDD}.log`

#### Scenario: Chain recording reference documents tenant-scoped layout

- **REMOVED** — superseded by **Scenario recording reference documents tenant-scoped layout and capture workflow**; reference file renamed to `docs/reference/scenario-recording.md`.

#### Scenario: Scenario recording reference documents tenant-scoped layout and capture workflow

- **GIVEN** tenant-scoped recording paths are implemented
- **WHEN** a reader opens `docs/reference/scenario-recording.md`
- **THEN** the page MUST document that scenario artifacts are written under `recordings/<tenant>/{scenarioName}/`
- **AND** MUST explain that `<tenant>` is derived from connection `baseurl`
- **AND** MUST document External Settings as the canonical capture path
- **AND** MUST document `npm run replay` as the interactive debug replay path
- **AND** MUST document `npm run test-recording` as the headless regression path

#### Scenario: Observability tuning guide documents tenant isolation

- **GIVEN** tenant-scoped log paths are implemented
- **WHEN** a reader opens the connection and observability tuning Use guide
- **THEN** the page MUST describe default external log location as `logs/<tenant>/fusion-{YYYYMMDD}.log` on the proxy server
- **AND** MUST mention `unknown-tenant` fallback when `baseurl` is unavailable

## RENAMED Requirements

- FROM: `#### Scenario: Chain recording reference documents tenant-scoped layout`
- TO: `#### Scenario: Scenario recording reference documents tenant-scoped layout and capture workflow`
