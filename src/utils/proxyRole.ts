/** Minimal config slice for proxy client/server role detection. */
export type ProxyRoleConfig = {
    externalProcessingEnabled?: boolean
    externalProxyEnabled?: boolean
    externalTargetUrl?: string
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
