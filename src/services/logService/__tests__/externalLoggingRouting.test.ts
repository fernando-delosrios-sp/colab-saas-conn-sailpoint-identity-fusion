import fs from 'fs/promises'
import { LogService } from '../logService'

describe('LogService external logging routing', () => {
    const originalFetch = global.fetch
    const originalProxyPassword = process.env.PROXY_PASSWORD
    const originalLogFile = process.env.LOG_FILE

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(async () => {
        global.fetch = originalFetch
        if (originalProxyPassword === undefined) {
            delete process.env.PROXY_PASSWORD
        } else {
            process.env.PROXY_PASSWORD = originalProxyPassword
        }
        if (originalLogFile === undefined) {
            delete process.env.LOG_FILE
        } else {
            process.env.LOG_FILE = originalLogFile
        }
        await fs.rm('logs', { recursive: true, force: true }).catch(() => {})
    })

    it('HTTP POSTs to external target URL for direct ISC processing', async () => {
        delete process.env.PROXY_PASSWORD
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: true,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://logs.example.com/ingest',
            externalLoggingLevel: 'info',
        })

        log.info('hello from isc')
        await log.flush()

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][0]).toBe('https://logs.example.com/ingest')
        expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
        expect(fetchMock.mock.calls[0][1]?.headers?.['x-fusion-baseurl']).toBeUndefined()
    })

    it('noop on proxy client — no HTTP POST and no disk write', async () => {
        delete process.env.PROXY_PASSWORD
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock
        const appendSpy = vi.spyOn(await import('../fileLogSink'), 'appendLogLine')

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            externalLoggingLevel: 'info',
            isProxy: false,
        })

        log.info('proxy client log')
        await log.flush()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(appendSpy).not.toHaveBeenCalled()
    })

    it('appends to tenant-scoped disk path on proxy server', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        delete process.env.LOG_FILE
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            externalLoggingLevel: 'info',
            baseurl: 'https://acme.api.identitynow.com',
        })

        log.info('proxy server log')
        await log.flush()

        expect(fetchMock).not.toHaveBeenCalled()
        const tenantLogDir = 'logs/acme'
        const files = await fs.readdir(tenantLogDir)
        expect(files.some((f) => f.startsWith('fusion-') && f.endsWith('.log'))).toBe(true)
    })

    it('uses unknown-tenant when baseurl is missing on proxy server', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        delete process.env.LOG_FILE
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            externalLoggingLevel: 'info',
        })

        log.info('fallback tenant log')
        await log.flush()

        const tenantLogDir = 'logs/unknown-tenant'
        const files = await fs.readdir(tenantLogDir)
        expect(files.some((f) => f.startsWith('fusion-') && f.endsWith('.log'))).toBe(true)
    })

    it('honors LOG_FILE on proxy server', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        process.env.LOG_FILE = 'logs/custom-server.log'
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            externalLoggingLevel: 'info',
        })

        log.info('custom path log')
        await log.flush()

        const content = await fs.readFile('logs/custom-server.log', 'utf8')
        expect(content).toContain('custom path log')
    })

    it('ignores deprecated LOG_FILE=logs/proxy-ingest.log on proxy server', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        process.env.LOG_FILE = 'logs/proxy-ingest.log'
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            externalLoggingLevel: 'info',
            baseurl: 'https://acme.api.identitynow.com',
        })

        log.info('tenant disk log')
        await log.flush()

        expect(fetchMock).not.toHaveBeenCalled()
        const tenantLogDir = 'logs/acme'
        const files = await fs.readdir(tenantLogDir)
        expect(files.some((f) => f.startsWith('fusion-') && f.endsWith('.log'))).toBe(true)
    })

    it('noop on proxy server host when proxy sub-option is off (never HTTP POST to self)', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: true,
            externalProxyEnabled: false,
            externalLoggingEnabled: true,
            externalTargetUrl: 'http://localhost:3000',
            externalLoggingLevel: 'info',
        })

        log.info('proxy server without proxy flag')
        await log.flush()

        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('gateway off disables external logging even when sub-toggle is stored true', async () => {
        delete process.env.PROXY_PASSWORD
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock

        const log = new LogService({
            spConnDebugLoggingEnabled: false,
            externalProcessingEnabled: false,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://logs.example.com/ingest',
            externalLoggingLevel: 'info',
        })

        expect(log.isExternalLoggingEnabled()).toBe(false)
        log.info('should not ship')
        await log.flush()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})


