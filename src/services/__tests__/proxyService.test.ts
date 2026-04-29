import { ProxyService } from '../proxyService'

describe('ProxyService.isProxyMode', () => {
    const originalProxyPassword = process.env.PROXY_PASSWORD

    afterEach(() => {
        if (originalProxyPassword === undefined) {
            delete process.env.PROXY_PASSWORD
        } else {
            process.env.PROXY_PASSWORD = originalProxyPassword
        }
    })

    it('returns true for proxy client mode', () => {
        delete process.env.PROXY_PASSWORD
        const config = {
            proxyEnabled: true,
            proxyUrl: 'https://proxy.example.com',
            isProxy: false,
        }
        const service = new ProxyService(config as any, {} as any, {} as any)

        expect(service.isProxyMode()).toBe(true)
    })

    it('returns false for already forwarded proxy request', () => {
        delete process.env.PROXY_PASSWORD
        const config = {
            proxyEnabled: true,
            proxyUrl: 'https://proxy.example.com',
            isProxy: true,
        }
        const service = new ProxyService(config as any, {} as any, {} as any)

        expect(service.isProxyMode()).toBe(false)
    })
})
