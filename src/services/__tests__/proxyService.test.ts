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
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            isProxy: false,
        }
        const service = new ProxyService(config as any, {} as any, {} as any)

        expect(service.isProxyMode()).toBe(true)
    })

    it('returns false when external processing gateway is off', () => {
        delete process.env.PROXY_PASSWORD
        const config = {
            externalProcessingEnabled: false,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            isProxy: false,
        }
        const service = new ProxyService(config as any, {} as any, {} as any)

        expect(service.isProxyMode()).toBe(false)
    })

    it('returns false for already forwarded proxy request', () => {
        delete process.env.PROXY_PASSWORD
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            isProxy: true,
        }
        const service = new ProxyService(config as any, {} as any, {} as any)

        expect(service.isProxyMode()).toBe(false)
    })
})

describe('ProxyService.isProxyService', () => {
    const originalProxyPassword = process.env.PROXY_PASSWORD

    afterEach(() => {
        if (originalProxyPassword === undefined) {
            delete process.env.PROXY_PASSWORD
        } else {
            process.env.PROXY_PASSWORD = originalProxyPassword
        }
    })

    it('throws error when server requires password but client provides none', () => {
        process.env.PROXY_PASSWORD = 'server_secret'
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetPassword: '',
        }
        const mockLog = { info: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        expect(() => service.isProxyService()).toThrow('Proxy password mismatch')
    })

    it('returns true when passwords match', () => {
        process.env.PROXY_PASSWORD = 'secret_password'
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetPassword: 'secret_password',
        }
        const mockLog = { info: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        expect(service.isProxyService()).toBe(true)
    })

    it('throws when client password is wrong', () => {
        process.env.PROXY_PASSWORD = 'correct_secret'
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetPassword: 'wrong_secret',
        }
        const mockLog = { info: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        expect(() => service.isProxyService()).toThrow('Proxy password mismatch')
    })

    it('throws when client password is omitted from forwarded config', () => {
        process.env.PROXY_PASSWORD = 'server_secret'
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
        }
        const mockLog = { info: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        expect(() => service.isProxyService()).toThrow('Proxy password mismatch')
    })

    it('does not enter server mode when gateway is off even if PROXY_PASSWORD is set', () => {
        process.env.PROXY_PASSWORD = 'server_secret'
        const config = {
            externalProcessingEnabled: false,
            externalProxyEnabled: true,
            externalTargetPassword: '',
        }
        const mockLog = { info: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        expect(service.isProxyService()).toBe(false)
    })

    it('accepts empty password when server PROXY_PASSWORD is empty string', () => {
        process.env.PROXY_PASSWORD = ''
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetPassword: '',
        }
        const mockLog = { info: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        expect(service.isProxyService()).toBe(true)
    })
})

describe('ProxyService.performFetch', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
        originalFetch = global.fetch
    })

    afterEach(() => {
        global.fetch = originalFetch
        vi.clearAllMocks()
    })

    it('throws ConnectorError when fetch throws AbortError', async () => {
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            proxyRequestTimeoutMs: 5000,
        }
        const mockLog = { error: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        const abortError = new Error('The operation was aborted')
        abortError.name = 'AbortError'
        global.fetch = vi.fn().mockRejectedValue(abortError)

        await expect((service as any).performFetch({})).rejects.toMatchObject({
            message: 'Proxy request to https://proxy.example.com timed out after 5000 ms',
        })
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('throws ConnectorError when fetch throws standard Error', async () => {
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
        }
        const mockLog = { error: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        const standardError = new Error('Network failure')
        global.fetch = vi.fn().mockRejectedValue(standardError)

        await expect((service as any).performFetch({})).rejects.toMatchObject({
            message: 'Failed to connect to proxy server at https://proxy.example.com: Network failure',
        })
        expect(mockLog.error).toHaveBeenCalledWith('Proxy fetch failed: Network failure')
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('throws ConnectorError when fetch throws unknown error', async () => {
        const config = {
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
        }
        const mockLog = { error: vi.fn() }
        const service = new ProxyService(config as any, mockLog as any, {} as any)

        global.fetch = vi.fn().mockRejectedValue('String error')

        await expect((service as any).performFetch({})).rejects.toMatchObject({
            message: 'Failed to connect to proxy server at https://proxy.example.com: Unknown error',
        })
        expect(mockLog.error).toHaveBeenCalledWith('Proxy fetch failed: Unknown fetch error')
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })
})

describe('ProxyService.processProxyResponse', () => {
    it('unwraps the data envelope from a proxy response', () => {
        const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
        const sent: unknown[] = []
        const mockRes = { send: vi.fn((item: unknown) => sent.push(item)) }
        const service = new ProxyService({} as any, mockLog as any, mockRes as any)

        const payload = JSON.stringify({ data: { id: 'acct-1', name: 'X' } })
        ;(service as any).processProxyResponse(payload)

        expect(sent).toEqual([{ id: 'acct-1', name: 'X' }])
    })
})
