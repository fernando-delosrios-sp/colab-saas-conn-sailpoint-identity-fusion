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

describe('ProxyService.execute', () => {
    let mockLog: any
    let mockRes: any
    let mockConfig: any

    beforeEach(() => {
        mockLog = {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
        }

        mockRes = {
            keepAlive: jest.fn(),
            send: jest.fn(),
        }

        mockConfig = {
            proxyEnabled: true,
            proxyUrl: 'https://proxy.example.com',
        }

        // Mock global fetch
        global.fetch = jest.fn()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('throws ConnectorError when proxy response contains malformed NDJSON', async () => {
        const service = new ProxyService(mockConfig, mockLog, mockRes)

        const malformedNdjson = '{"valid": true}\n{malformed'

        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue(malformedNdjson),
        })

        await expect(service.execute({})).rejects.toMatchObject({
            message: expect.stringContaining('Failed to parse JSON line from proxy response'),
        })

        // Verify that the error log was called for the malformed line
        expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse line: {malformed'))
    })
})
