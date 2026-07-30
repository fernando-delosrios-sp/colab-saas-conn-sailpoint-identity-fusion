## ADDED Requirements

### Requirement: External logging SHALL route by connector role and proxy mode

When `externalProcessingEnabled` and `externalLoggingEnabled` are both true, the log service MUST route external log delivery based on connector role:

- **Proxy client** (`isProxyMode()` true): MUST NOT send external logs (noop).
- **Proxy server** (`isProxyService()` true): MUST append plain-text log lines to disk at `process.env.LOG_FILE` when set, otherwise `logs/fusion-{YYYYMMDD}.log`.
- **Direct ISC processing** (neither proxy client nor server): MUST HTTP POST plain-text log lines to `externalTargetUrl`. The external target password MUST be ignored for this path.

External logging MUST honor `externalLoggingLevel` for level filtering in all active paths. HTTP POST URLs MUST use http or https scheme validation (SSRF guard).

#### Scenario: Direct ISC processing posts logs to external target URL

- **GIVEN** `externalProcessingEnabled` and `externalLoggingEnabled` are `true`
- **AND** `externalProxyEnabled` is `false`
- **AND** `externalTargetUrl` is `https://logs.example.com/ingest`
- **AND** the connector is processing operations directly on ISC (not proxy client or server)
- **WHEN** `LogService` emits a log at or above the configured external level
- **THEN** it MUST HTTP POST a plain-text line to `externalTargetUrl`
- **AND** MUST NOT include the external target password in the request

#### Scenario: Proxy client does not external-log

- **GIVEN** `externalProcessingEnabled`, `externalProxyEnabled`, and `externalLoggingEnabled` are all `true`
- **AND** the connector is running as a proxy client on ISC
- **WHEN** `LogService` emits operational logs during a forwarded operation
- **THEN** it MUST NOT HTTP POST to the external target URL
- **AND** MUST NOT write to the disk log sink

#### Scenario: Proxy server appends logs to disk

- **GIVEN** `externalProcessingEnabled`, `externalProxyEnabled`, and `externalLoggingEnabled` are all `true`
- **AND** the connector is running as a proxy server (`PROXY_PASSWORD` is set)
- **AND** `LOG_FILE` is not set
- **WHEN** `LogService` emits a log at or above the configured external level
- **THEN** it MUST append a sanitized plain-text line to `logs/fusion-{YYYYMMDD}.log`
- **AND** MUST NOT HTTP POST to the external target URL

#### Scenario: Proxy server honors LOG_FILE environment variable

- **GIVEN** the connector is running as a proxy server with external logging enabled
- **AND** `process.env.LOG_FILE` is `/var/log/fusion/connector.log`
- **WHEN** `LogService` emits an external log line
- **THEN** it MUST append to `/var/log/fusion/connector.log`

### Requirement: External logging config SHALL live in External Settings

External logging configuration MUST be read from External Settings: `externalProcessingEnabled`, `externalLoggingEnabled`, `externalLoggingLevel`, and `externalTargetUrl` (when proxy is off). The former keys `externalLoggingUrl` and Developer Settings placement SHALL NOT be used at runtime.

#### Scenario: Gateway off disables external logging

- **GIVEN** `externalProcessingEnabled` is `false`
- **AND** `externalLoggingEnabled` is stored as `true` in platform config
- **WHEN** `LogService` is constructed
- **THEN** external logging MUST be inactive
