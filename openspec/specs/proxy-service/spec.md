# proxy-service Spec

## Purpose

The proxy service (`src/services/proxyService.ts`) is the connector's adapter for the optional external proxy server. When the operator configures a proxy, every connector operation is forwarded through it instead of going directly to SailPoint. The service is responsible for unwrapping the proxy's `data` envelope, applying the configured request timeout (`DEFAULT_PROXY_REQUEST_TIMEOUT_MS`, 5 minutes), and surfacing upstream errors as `ConnectorError`. This spec defines the contract between the operations layer and the proxy, including timeout, envelope, and error translation behavior.

## Requirements

### Requirement: Outbound operations MUST be forwarded through the configured proxy when one is set

When the operator has configured a proxy, the proxy service MUST forward every connector operation through it instead of issuing requests directly. The service MUST unwrap the proxy's `data` envelope, apply the configured request timeout (`DEFAULT_PROXY_REQUEST_TIMEOUT_MS`, 5 minutes), and translate upstream failures into `ConnectorError` so the rest of the connector can handle them uniformly.

#### Scenario: A response is unwrapped from the proxy envelope

- **GIVEN** a proxy response `{ data: { id: 'acct-1', name: 'X' } }`
- **WHEN** the proxy service returns the response to the caller
- **THEN** the caller sees `{ id: 'acct-1', name: 'X' }` — the `data` envelope has been unwrapped

#### Scenario: A request that exceeds the proxy timeout is aborted

- **GIVEN** a proxy request that does not respond within `DEFAULT_PROXY_REQUEST_TIMEOUT_MS`
- **WHEN** the timeout fires
- **THEN** the proxy service surfaces a `ConnectorError` to the caller
- **AND** the underlying connection is aborted, not left to time out at the transport level
