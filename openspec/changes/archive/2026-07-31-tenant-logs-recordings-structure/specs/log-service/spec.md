## MODIFIED Requirements

### Requirement: External logging SHALL route by connector role and proxy mode

When `externalProcessingEnabled` and `externalLoggingEnabled` are both true, the log service MUST route external log delivery based on connector role:

- **Proxy client** (`isProxyMode()` true): MUST NOT send external logs (noop).
- **Proxy server** (`isProxyService()` true): MUST append plain-text log lines to disk at `process.env.LOG_FILE` when set, otherwise `logs/<tenant>/fusion-{YYYYMMDD}.log` where `<tenant>` is a filesystem-safe slug derived from connection `baseurl` (first hostname label, sanitized; fallback `unknown-tenant`). The tenant subdirectory MUST be created automatically before the first append.
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
- **AND** connection `baseurl` is `https://acme.api.identitynow.com`
- **AND** `LOG_FILE` is not set
- **WHEN** `LogService` emits a log at or above the configured external level
- **THEN** it MUST append a sanitized plain-text line to `logs/acme/fusion-{YYYYMMDD}.log`
- **AND** MUST NOT HTTP POST to the external target URL

#### Scenario: Proxy server uses unknown-tenant when baseurl is missing

- **GIVEN** the connector is running as a proxy server with external logging enabled
- **AND** connection `baseurl` is missing or unparseable
- **AND** `LOG_FILE` is not set
- **WHEN** `LogService` emits an external log line
- **THEN** it MUST append to `logs/unknown-tenant/fusion-{YYYYMMDD}.log`

#### Scenario: Proxy server honors LOG_FILE environment variable

- **GIVEN** the connector is running as a proxy server with external logging enabled
- **AND** `process.env.LOG_FILE` is `/var/log/fusion/connector.log`
- **WHEN** `LogService` emits an external log line
- **THEN** it MUST append to `/var/log/fusion/connector.log`
- **AND** MUST NOT inject a tenant subdirectory into the path

## ADDED Requirements

### Requirement: Tenant slug derivation for artifact paths SHALL use connection baseurl

The connector MUST expose a shared helper that derives a filesystem-safe tenant slug from connection `baseurl` for log and recording path resolution. The slug MUST be the first hostname label when the host is a conventional domain name. IPv4, IPv6, and bare-hostname inputs MUST be sanitized to filesystem-safe segments. When `baseurl` is missing, empty, or unparseable, the helper MUST return `unknown-tenant`.

#### Scenario: Standard ISC API URL yields tenant slug

- **GIVEN** connection `baseurl` is `https://acme.api.identitynow.com`
- **WHEN** the tenant slug helper is invoked
- **THEN** it MUST return `acme`

#### Scenario: Invalid baseurl yields fallback slug

- **GIVEN** connection `baseurl` is empty or not a valid URL
- **WHEN** the tenant slug helper is invoked
- **THEN** it MUST return `unknown-tenant`
