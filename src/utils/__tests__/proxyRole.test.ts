import { isProxyClientConfig, isProxyServerHost } from '../proxyRole'

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
})
