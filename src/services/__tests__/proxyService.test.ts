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

describe('ProxyService.performFetch', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
        originalFetch = global.fetch
    })

    afterEach(() => {
        global.fetch = originalFetch
        jest.clearAllMocks()
    })

    it('throws ConnectorError when fetch throws AbortError', async () => {
        const config = {
            proxyEnabled: true,
            proxyUrl: 'https://proxy.example.com',
            proxyRequestTimeoutMs: 5000,
        }
        const mockLog = { error: jest.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        const abortError = new Error('The operation was aborted')
        abortError.name = 'AbortError'
        global.fetch = jest.fn().mockRejectedValue(abortError)

        await expect((service as any).performFetch({})).rejects.toMatchObject({
            message: 'Proxy request to https://proxy.example.com timed out after 5000 ms',
        })
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('throws ConnectorError when fetch throws standard Error', async () => {
        const config = {
            proxyEnabled: true,
            proxyUrl: 'https://proxy.example.com',
        }
        const mockLog = { error: jest.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        const standardError = new Error('Network failure')
        global.fetch = jest.fn().mockRejectedValue(standardError)

        await expect((service as any).performFetch({})).rejects.toMatchObject({
            message: 'Failed to connect to proxy server at https://proxy.example.com: Network failure',
        })
        expect(mockLog.error).toHaveBeenCalledWith('Proxy fetch failed: Network failure')
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('throws ConnectorError when fetch throws unknown error', async () => {
        const config = {
            proxyEnabled: true,
            proxyUrl: 'https://proxy.example.com',
        }
        const mockLog = { error: jest.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        global.fetch = jest.fn().mockRejectedValue('String error')

        await expect((service as any).performFetch({})).rejects.toMatchObject({
            message: 'Failed to connect to proxy server at https://proxy.example.com: Unknown error',
        })
        expect(mockLog.error).toHaveBeenCalledWith('Proxy fetch failed: Unknown fetch error')
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })
})
