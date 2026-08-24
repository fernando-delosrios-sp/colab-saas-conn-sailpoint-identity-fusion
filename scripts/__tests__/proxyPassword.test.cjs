/* global describe, it, expect, afterEach */
import { assertProxyCommandAuthorized, proxyPasswordsMatch } from '../proxyPassword.cjs'

describe('proxyPassword.cjs', () => {
    const envBackup = process.env.PROXY_PASSWORD

    afterEach(() => {
        if (envBackup === undefined) {
            delete process.env.PROXY_PASSWORD
        } else {
            process.env.PROXY_PASSWORD = envBackup
        }
    })

    it('matches identical passwords', () => {
        expect(proxyPasswordsMatch('secret', 'secret')).toBe(true)
    })

    it('rejects mismatched passwords at the HTTP boundary', () => {
        process.env.PROXY_PASSWORD = 'server-secret'
        expect(() =>
            assertProxyCommandAuthorized({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetPassword: 'wrong-secret',
            })
        ).toThrow('Proxy password mismatch')
    })

    it('requires PROXY_PASSWORD when proxy mode is enabled in the payload', () => {
        delete process.env.PROXY_PASSWORD
        expect(() =>
            assertProxyCommandAuthorized({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetPassword: 'secret',
            })
        ).toThrow('PROXY_PASSWORD environment variable is not set')
    })

    it('authenticates proxy payloads even when isProxy flag is missing', () => {
        process.env.PROXY_PASSWORD = 'server-secret'
        expect(() =>
            assertProxyCommandAuthorized({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetPassword: 'wrong-secret',
            })
        ).toThrow('Proxy password mismatch')
    })

    it('ignores non-proxy payloads', () => {
        delete process.env.PROXY_PASSWORD
        expect(() =>
            assertProxyCommandAuthorized({
                externalProcessingEnabled: true,
                externalProxyEnabled: false,
                externalTargetPassword: 'secret',
            })
        ).not.toThrow()
    })
})
