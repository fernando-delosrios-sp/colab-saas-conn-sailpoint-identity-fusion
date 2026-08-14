import {
    assertForwardedProxyAuthorized,
    assertProxyRouting,
    getProxyClientBlockReason,
    isProxyClientConfig,
    isProxyServerHost,
} from '../proxyRole'
import { ConnectorError } from '@sailpoint/connector-sdk'

describe('proxyRole', () => {
    const envBackup = { ...process.env }

    afterEach(() => {
        process.env = { ...envBackup }
    })

    it('isProxyServerHost when PROXY_PASSWORD is set', () => {
        process.env.PROXY_PASSWORD = 'secret'
        expect(isProxyServerHost()).toBe(true)
    })

    it('isProxyClientConfig when forwarding to external target without PROXY_PASSWORD', () => {
        delete process.env.PROXY_PASSWORD
        expect(
            isProxyClientConfig({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetUrl: 'https://proxy.example.com',
                isProxy: false,
            })
        ).toBe(true)
    })

    it('isProxyClientConfig is false when PROXY_PASSWORD is set', () => {
        process.env.PROXY_PASSWORD = 'secret'
        expect(
            isProxyClientConfig({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetUrl: 'https://proxy.example.com',
            })
        ).toBe(false)
    })

    describe('getProxyClientBlockReason', () => {
        it('returns undefined when proxy mode is not requested', () => {
            delete process.env.PROXY_PASSWORD
            expect(getProxyClientBlockReason({ externalProcessingEnabled: false })).toBeUndefined()
        })

        it('returns undefined when proxy client mode is active', () => {
            delete process.env.PROXY_PASSWORD
            expect(
                getProxyClientBlockReason({
                    externalProcessingEnabled: true,
                    externalProxyEnabled: true,
                    externalTargetUrl: 'https://proxy.example.com',
                })
            ).toBeUndefined()
        })

        it('explains missing Server URL when proxy is enabled', () => {
            delete process.env.PROXY_PASSWORD
            expect(
                getProxyClientBlockReason({
                    externalProcessingEnabled: true,
                    externalProxyEnabled: true,
                    externalTargetUrl: '',
                })
            ).toMatch(/Server URL/i)
        })
    })

    describe('assertForwardedProxyAuthorized', () => {
        it('throws before side effects when forwarded password is wrong', () => {
            process.env.PROXY_PASSWORD = 'server-secret'
            expect(() =>
                assertForwardedProxyAuthorized({
                    isProxy: true,
                    externalProcessingEnabled: true,
                    externalProxyEnabled: true,
                    externalTargetPassword: 'wrong-secret',
                })
            ).toThrow('Proxy password mismatch')
        })

        it('no-ops for non-forwarded payloads on hosts without PROXY_PASSWORD', () => {
            delete process.env.PROXY_PASSWORD
            expect(() =>
                assertForwardedProxyAuthorized({
                    externalProcessingEnabled: true,
                    externalProxyEnabled: true,
                })
            ).not.toThrow()
        })

        it('authenticates proxy payloads on server host without isProxy flag', () => {
            process.env.PROXY_PASSWORD = 'server-secret'
            expect(() =>
                assertForwardedProxyAuthorized({
                    externalProcessingEnabled: true,
                    externalProxyEnabled: true,
                    externalTargetPassword: 'wrong-secret',
                })
            ).toThrow('Proxy password mismatch')
        })
    })

    describe('assertProxyRouting', () => {
        it('throws when proxy is configured on ISC but client forwarding cannot activate', () => {
            delete process.env.PROXY_PASSWORD
            expect(() =>
                assertProxyRouting({
                    externalProcessingEnabled: true,
                    externalProxyEnabled: true,
                    externalTargetUrl: '',
                })
            ).toThrow(ConnectorError)
        })

        it('does not throw for forwarded proxy server requests', () => {
            process.env.PROXY_PASSWORD = 'secret'
            expect(() =>
                assertProxyRouting({
                    externalProcessingEnabled: true,
                    externalProxyEnabled: true,
                    externalTargetUrl: 'https://proxy.example.com',
                    externalTargetPassword: 'secret',
                    isProxy: true,
                })
            ).not.toThrow()
        })

        it('does not throw when proxy mode is off', () => {
            delete process.env.PROXY_PASSWORD
            expect(() =>
                assertProxyRouting({
                    externalProcessingEnabled: true,
                    externalProxyEnabled: false,
                })
            ).not.toThrow()
        })
    })
})
