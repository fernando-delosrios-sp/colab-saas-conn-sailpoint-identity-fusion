import crypto from 'crypto'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { bootstrapLog } from '../services/logService'

/** Minimal config slice for proxy client/server role detection. */
export type ProxyRoleConfig = {
    externalProcessingEnabled?: boolean
    externalProxyEnabled?: boolean
    externalTargetUrl?: string
    externalTargetPassword?: string
    isProxy?: boolean
}

/** True when this host should forward operations to `externalTargetUrl` (ISC proxy client). */
export function isProxyClientConfig(config: ProxyRoleConfig): boolean {
    return (
        config.externalProcessingEnabled === true &&
        config.externalProxyEnabled === true &&
        config.externalTargetUrl !== undefined &&
        config.externalTargetUrl !== '' &&
        process.env.PROXY_PASSWORD === undefined &&
        config.isProxy !== true
    )
}

/** True when this host runs as the proxy server that receives forwarded operations. */
export function isProxyServerHost(): boolean {
    return process.env.PROXY_PASSWORD !== undefined
}

/** True when forwarded proxy operations or recording artifacts should run on this host. */
export function isProxyServerExecutionHost(config: ProxyRoleConfig): boolean {
    return isProxyServerHost() || config.isProxy === true
}

function requiresProxyServerPassword(config: ProxyRoleConfig): boolean {
    return config.externalProcessingEnabled === true && config.externalProxyEnabled === true
}

function shouldAuthenticateProxyServer(config: ProxyRoleConfig): boolean {
    return requiresProxyServerPassword(config) && (config.isProxy === true || isProxyServerHost())
}

function proxyPasswordsMatch(serverPassword: string, clientPassword: string): boolean {
    const expectedHash = crypto.createHash('sha256').update(serverPassword).digest()
    const actualHash = crypto.createHash('sha256').update(clientPassword).digest()
    return crypto.timingSafeEqual(expectedHash, actualHash)
}

const PROXY_PASSWORD_ENV_HINT =
    'Add PROXY_PASSWORD to the repo-root .env file (or export it) and restart the proxy server (npm run debug).'

export function assertProxyServerPassword(clientPassword: string | undefined): void {
    if (process.env.PROXY_PASSWORD === undefined) {
        const message = `PROXY_PASSWORD environment variable is not set on the proxy server host. ${PROXY_PASSWORD_ENV_HINT}`
        bootstrapLog.error(message)
        throw new ConnectorError(message, ConnectorErrorType.Generic)
    }

    const serverPassword = process.env.PROXY_PASSWORD || ''
    const providedPassword = clientPassword || ''
    if (!proxyPasswordsMatch(serverPassword, providedPassword)) {
        bootstrapLog.error('Proxy password mismatch')
        throw new ConnectorError('Proxy password mismatch', ConnectorErrorType.Generic)
    }
}

/**
 * Validates proxy credentials before recording or other side effects start.
 * Must run immediately after config normalization and before {@link bridgeExternalRecording}.
 */
export function assertForwardedProxyAuthorized(config: ProxyRoleConfig): void {
    if (!shouldAuthenticateProxyServer(config)) {
        return
    }
    assertProxyServerPassword(config.externalTargetPassword)
}

function isProxyRequested(config: ProxyRoleConfig): boolean {
    return requiresProxyServerPassword(config)
}

/** Human-readable reason proxy client forwarding is blocked, when proxy mode was requested. */
export function getProxyClientBlockReason(config: ProxyRoleConfig): string | undefined {
    if (!isProxyRequested(config) || isProxyClientConfig(config)) {
        return undefined
    }
    if (config.isProxy === true) {
        return undefined
    }
    if (isProxyServerHost()) {
        return undefined
    }

    const targetUrl = config.externalTargetUrl?.trim()
    if (!targetUrl) {
        return (
            'Proxy mode is enabled but Server URL (externalTargetUrl) is empty, so the connector cannot forward ' +
            'operations to your proxy server. Set Server URL under Advanced Settings → External Settings and save the source.'
        )
    }
    return 'Proxy mode is enabled but proxy client forwarding is inactive for an unknown reason.'
}

/**
 * Fail fast when External Settings request proxy forwarding but this host will run the operation locally instead.
 * Prevents silent default-mode execution that never contacts the configured proxy URL.
 */
export function assertProxyRouting(config: ProxyRoleConfig): void {
    const reason = getProxyClientBlockReason(config)
    if (reason) {
        throw new ConnectorError(reason, ConnectorErrorType.Generic)
    }
}
