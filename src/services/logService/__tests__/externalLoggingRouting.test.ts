import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { LogService } from '../logService'
import { resolveLogFilePath } from '../fileLogSink'

describe('LogService external logging routing', () => {
    const originalFetch = global.fetch
    const originalProxyPassword = process.env.PROXY_PASSWORD
    const originalLogFile = process.env.LOG_FILE
    let sandboxDir: string

    beforeEach(async () => {
        vi.restoreAllMocks()
        sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fusion-log-routing-'))
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
        await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {})
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
        const appendSpy = vi.spyOn(await import('../fileLogSink'), 'appendLogLine').mockResolvedValue(undefined)

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
        expect(appendSpy).toHaveBeenCalledWith(
            expect.stringContaining('proxy server log'),
            'https://acme.api.identitynow.com'
        )
        expect(resolveLogFilePath('https://acme.api.identitynow.com', new Date(2026, 7, 26))).toBe(
            path.join('logs', 'acme', 'fusion-20260826.log')
        )
    })

    it('uses unknown-tenant when baseurl is missing on proxy server', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        delete process.env.LOG_FILE
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock
        const appendSpy = vi.spyOn(await import('../fileLogSink'), 'appendLogLine').mockResolvedValue(undefined)

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

        expect(appendSpy).toHaveBeenCalledWith(expect.stringContaining('fallback tenant log'), undefined)
        expect(resolveLogFilePath(undefined, new Date(2026, 7, 26))).toBe(
            path.join('logs', 'unknown-tenant', 'fusion-20260826.log')
        )
    })

    it('honors LOG_FILE on proxy server', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        const logFile = path.join(sandboxDir, 'nested', 'custom-server.log')
        process.env.LOG_FILE = logFile
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

        const content = await fs.readFile(logFile, 'utf8')
        expect(content).toContain('custom path log')
    })

    it('ignores deprecated LOG_FILE=logs/proxy-ingest.log on proxy server', async () => {
        process.env.PROXY_PASSWORD = 'secret'
        process.env.LOG_FILE = path.join(sandboxDir, 'logs', 'proxy-ingest.log')
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock
        const appendSpy = vi.spyOn(await import('../fileLogSink'), 'appendLogLine').mockResolvedValue(undefined)

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
        expect(appendSpy).toHaveBeenCalledWith(
            expect.stringContaining('tenant disk log'),
            'https://acme.api.identitynow.com'
        )
        expect(resolveLogFilePath('https://acme.api.identitynow.com', new Date(2026, 7, 26))).toBe(
            path.join('logs', 'acme', 'fusion-20260826.log')
        )
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
