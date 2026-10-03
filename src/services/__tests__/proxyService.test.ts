import { ProxyService } from '../proxyService'

describe('ProxyService.execute', () => {
    const originalFetch = global.fetch

    afterEach(() => {
        global.fetch = originalFetch
    })

    const jsonHeaders = {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/x-ndjson' : null),
    }

    it('skips keepAlive lines when parsing an NDJSON response', async () => {
        const send = jest.fn()
        const keepAlive = jest.fn()
        const config = { proxyEnabled: true, proxyUrl: 'https://proxy.example.com' }
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: jsonHeaders,
            text: () =>
                Promise.resolve(
                    '{"data":{},"type":"keepAlive"}\n' +
                        '{"data":{"identity":"a"},"type":"output"}\n' +
                        '{"data":{},"type":"keepAlive"}\n' +
                        '{"data":{"identity":"b"},"type":"output"}\n'
                ),
        } as any)

        const service = new ProxyService(config as any, log as any, { send, keepAlive, saveState: jest.fn() } as any)
        await service.execute({})

        expect(send).toHaveBeenCalledTimes(2)
        expect(send).toHaveBeenNthCalledWith(1, { identity: 'a' })
        expect(send).toHaveBeenNthCalledWith(2, { identity: 'b' })
        expect(keepAlive).not.toHaveBeenCalled()
    })

    it('rejects HTML from a reverse proxy instead of parsing it as NDJSON', async () => {
        const config = { proxyEnabled: true, proxyUrl: 'https://proxy.example.com' }
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: {
                get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null),
            },
            text: () => Promise.resolve('<!doctype html><html><body>Caddy</body></html>'),
        } as any)

        const service = new ProxyService(config as any, log as any, { send: jest.fn(), keepAlive: jest.fn() } as any)
        await expect(service.execute({})).rejects.toThrow(/returned HTML instead of a JSON stream/)
    })

    it('replays POST across 308 redirects instead of converting them to GET', async () => {
        const send = jest.fn()
        const config = { proxyEnabled: true, proxyUrl: 'http://proxy.example.com/' }
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        const fetchMock = jest
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 308,
                headers: {
                    get: (name: string) => (name.toLowerCase() === 'location' ? 'https://proxy.example.com/' : null),
                },
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
                text: () => Promise.resolve(''),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: jsonHeaders,
                text: () => Promise.resolve('{"data":{"identity":"a"},"type":"output"}\n'),
            })
        global.fetch = fetchMock as any

        const service = new ProxyService(
            config as any,
            log as any,
            { send, keepAlive: jest.fn(), saveState: jest.fn() } as any
        )
        await service.execute({})

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(fetchMock.mock.calls[0][1].method).toBe('POST')
        expect(fetchMock.mock.calls[0][1].redirect).toBe('manual')
        expect(fetchMock.mock.calls[1][0]).toBe('https://proxy.example.com/')
        expect(fetchMock.mock.calls[1][1].method).toBe('POST')
        expect(send).toHaveBeenCalledWith({ identity: 'a' })
    })
})

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
