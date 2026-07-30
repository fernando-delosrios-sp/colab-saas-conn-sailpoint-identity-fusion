## MODIFIED Requirements

### Requirement: Outbound operations MUST be forwarded through the configured proxy when one is set

When the operator has enabled external processing and proxy mode (`externalProcessingEnabled` and `externalProxyEnabled`), the proxy service MUST forward every connector operation to `externalTargetUrl` instead of issuing requests directly. The service MUST authenticate with `externalTargetPassword` against the server `PROXY_PASSWORD` environment variable. The service MUST unwrap the proxy's `data` envelope, apply the configured request timeout (`DEFAULT_PROXY_REQUEST_TIMEOUT_MS`, 5 minutes), and translate upstream failures into `ConnectorError` so the rest of the connector can handle them uniformly. Proxy mode MUST NOT activate when `externalProcessingEnabled` is false, when `externalProxyEnabled` is false, when `externalTargetUrl` is empty, when the connector is already processing a forwarded request (`isProxy: true`), or when the connector is running as the proxy server (`PROXY_PASSWORD` is set).

#### Scenario: A response is unwrapped from the proxy envelope

- **GIVEN** a proxy response `{ data: { id: 'acct-1', name: 'X' } }`
- **WHEN** the proxy service returns the response to the caller
- **THEN** the caller sees `{ id: 'acct-1', name: 'X' }` — the `data` envelope has been unwrapped

#### Scenario: A request that exceeds the proxy timeout is aborted

- **GIVEN** a proxy request that does not respond within `DEFAULT_PROXY_REQUEST_TIMEOUT_MS`
- **WHEN** the timeout fires
- **THEN** the proxy service surfaces a `ConnectorError` to the caller
- **AND** the underlying connection is aborted, not left to time out at the transport level

#### Scenario: Proxy client mode requires external processing gateway and proxy sub-option

- **GIVEN** `externalProcessingEnabled` is `true`
- **AND** `externalProxyEnabled` is `true`
- **AND** `externalTargetUrl` is a valid http or https URL
- **AND** `PROXY_PASSWORD` is not set on the host
- **AND** `isProxy` is not `true` in config
- **WHEN** `ProxyService.isProxyMode()` is evaluated
- **THEN** it MUST return `true`

#### Scenario: Gateway off disables proxy client mode

- **GIVEN** `externalProcessingEnabled` is `false`
- **AND** legacy-style proxy sub-fields would otherwise be set
- **WHEN** `ProxyService.isProxyMode()` is evaluated
- **THEN** it MUST return `false`

## ADDED Requirements

### Requirement: External Settings config keys SHALL drive proxy behavior

The connector SHALL read proxy configuration from External Settings fields: `externalProcessingEnabled`, `externalProxyEnabled`, `externalTargetUrl`, and `externalTargetPassword`. The former keys `proxyEnabled`, `proxyUrl`, and `proxyPassword` SHALL NOT be read at runtime.

#### Scenario: Config reader validates proxy prerequisites

- **GIVEN** `externalProcessingEnabled` is `true` and `externalProxyEnabled` is `true`
- **WHEN** `safeReadConfig()` completes
- **THEN** `externalTargetUrl` MUST be present and use http or https
- **AND** `externalTargetPassword` MUST be present
