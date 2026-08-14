const crypto = require('crypto')

function isProxyEnabled(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'True'
}

function requiresProxyServerPassword(config) {
    return config && isProxyEnabled(config.externalProcessingEnabled) && isProxyEnabled(config.externalProxyEnabled)
}

function proxyPasswordsMatch(serverPassword, clientPassword) {
    const expectedHash = crypto.createHash('sha256').update(serverPassword ?? '').digest()
    const actualHash = crypto.createHash('sha256').update(clientPassword ?? '').digest()
    return crypto.timingSafeEqual(expectedHash, actualHash)
}

function describeProxyAuthContext(config) {
    return {
        externalProcessingEnabled: config?.externalProcessingEnabled,
        externalProxyEnabled: config?.externalProxyEnabled,
        isProxy: config?.isProxy,
        clientPasswordPresent: Boolean(config?.externalTargetPassword),
        envPasswordPresent: process.env.PROXY_PASSWORD !== undefined,
    }
}

/** Validates connector commands on the proxy server HTTP boundary before runtime side effects. */
function assertProxyCommandAuthorized(config) {
    if (!requiresProxyServerPassword(config)) {
        return { authorized: true, skipped: true, reason: 'proxy mode not enabled in payload' }
    }

    if (process.env.PROXY_PASSWORD === undefined) {
        throw new Error(
            'PROXY_PASSWORD environment variable is not set on the proxy server host. Add PROXY_PASSWORD to the repo-root .env file (or export it) and restart npm run debug.'
        )
    }

    const serverPassword = process.env.PROXY_PASSWORD || ''
    const clientPassword = config.externalTargetPassword || ''
    if (!proxyPasswordsMatch(serverPassword, clientPassword)) {
        throw new Error('Proxy password mismatch')
    }

    return { authorized: true, skipped: false }
}

module.exports = {
    assertProxyCommandAuthorized,
    describeProxyAuthContext,
    isProxyEnabled,
    proxyPasswordsMatch,
    requiresProxyServerPassword,
}
