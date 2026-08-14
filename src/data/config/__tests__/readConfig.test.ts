import { readConfig } from '@sailpoint/connector-sdk'
import { safeReadConfig } from '../readConfig'
import { ProxyService } from '../../../services/proxyService'

vi.mock('@sailpoint/connector-sdk', async () => {
    const actual = await vi.importActual<typeof import('@sailpoint/connector-sdk')>('@sailpoint/connector-sdk')
    return {
        ...actual,
        readConfig: vi.fn(),
    }
})

const minimalPlatformConfig = {
    baseurl: 'https://tenant.identitynow.com',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    spConnectorInstanceId: 'instance-id',
    sources: [],
}

describe('safeReadConfig recording env bridge', () => {
    const envBackup = { ...process.env }

    beforeEach(() => {
        vi.mocked(readConfig).mockResolvedValue(minimalPlatformConfig as never)
    })

    afterEach(() => {
        process.env = { ...envBackup }
    })

    it('resolves RECORD_MODE env into config.recording when platform config has no recording.mode', async () => {
        process.env.RECORD_MODE = 'true'
        process.env.RECORD_CHAIN_NAME = 'env-chain'
        process.env.VERBOSE_RECORDING = 'true'

        const config = await safeReadConfig()

        expect(config.recording?.mode).toBe('record')
        expect(config.recording?.scenarioName).toBe('env-chain')
        expect(config.recording?.chainName).toBe('env-chain')
        expect(config.recording?.verbose).toBe(true)
        expect(config.recording?.store).toBe('ndjson')
    })

    it('explicit platform recording.mode overrides RECORD_MODE env', async () => {
        process.env.RECORD_MODE = 'true'
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            recording: { mode: 'off' },
        } as never)

        const config = await safeReadConfig()

        expect(config.recording?.mode).toBe('off')
    })

    it('bridges External Settings recording name into config.recording on proxy server host', async () => {
        delete process.env.RECORD_MODE
        delete process.env.RECORD_CHAIN_NAME
        process.env.PROXY_PASSWORD = 'secret'
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
        } as never)

        const config = await safeReadConfig()

        expect(config.recording?.mode).toBe('record')
        expect(config.recording?.scenarioName).toBe('prod-baseline')
        expect(config.recording?.chainName).toBe('prod-baseline')
    })

    it('bridges external recording on proxy server when forwarded config has client-resolved recording.mode off', async () => {
        delete process.env.RECORD_MODE
        delete process.env.RECORD_CHAIN_NAME
        process.env.PROXY_PASSWORD = 'secret'
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
            isProxy: true,
            recording: { mode: 'off', store: 'ndjson' },
        } as never)

        const config = await safeReadConfig()

        expect(config.recording?.mode).toBe('record')
        expect(config.recording?.scenarioName).toBe('prod-baseline')
        expect(config.recording?.chainName).toBe('prod-baseline')
    })

    it('does not bridge recording when forwarded proxy password auth fails', async () => {
        process.env.PROXY_PASSWORD = 'correct-secret'
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'cullen',
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'wrong-secret',
            isProxy: true,
            recording: { mode: 'off', store: 'ndjson' },
        } as never)

        await expect(safeReadConfig()).rejects.toThrow('Proxy password mismatch')
    })

    it('rejects forwarded proxy payload when PROXY_PASSWORD env is missing', async () => {
        delete process.env.PROXY_PASSWORD
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
            isProxy: true,
        } as never)

        await expect(safeReadConfig()).rejects.toThrow('PROXY_PASSWORD environment variable is not set')
    })

    it('rejects proxy payload on server host when password is wrong even without isProxy flag', async () => {
        process.env.PROXY_PASSWORD = 'server-secret'
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'wrong-secret',
        } as never)

        await expect(safeReadConfig()).rejects.toThrow('Proxy password mismatch')
    })

    it('bridges external recording for authorized forwarded proxy payload', async () => {
        delete process.env.RECORD_MODE
        delete process.env.RECORD_CHAIN_NAME
        process.env.PROXY_PASSWORD = 'secret'
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
            isProxy: true,
            recording: { mode: 'off', store: 'ndjson' },
        } as never)

        const config = await safeReadConfig()

        expect(config.recording?.mode).toBe('record')
        expect(config.recording?.scenarioName).toBe('prod-baseline')
    })

    it('does not bridge External Settings recording on ISC proxy client', async () => {
        delete process.env.RECORD_MODE
        delete process.env.RECORD_CHAIN_NAME
        delete process.env.PROXY_PASSWORD
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
        } as never)

        const config = await safeReadConfig()

        expect(config.recording?.mode).toBe('off')
        expect(config.recording?.scenarioName).toBeUndefined()
        expect(config.recording?.chainName).toBeUndefined()
    })

    it('resolves proxy client mode from External Settings via safeReadConfig', async () => {
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: 1,
            externalProxyEnabled: 1,
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
        } as never)

        const config = await safeReadConfig()
        delete process.env.PROXY_PASSWORD

        const proxy = new ProxyService(config, { info: vi.fn() } as any, {} as any, 'std:account:list')

        expect(config.externalProcessingEnabled).toBe(true)
        expect(config.externalProxyEnabled).toBe(true)
        expect(config.externalTargetUrl).toBe('https://proxy.example.com')
        expect(proxy.isProxyMode()).toBe(true)
    })

    it('fails validation when recording enabled without proxy', async () => {
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'bad-chain',
        } as never)

        await expect(safeReadConfig()).rejects.toThrow('External recording requires proxy mode')
    })
})

describe('safeReadConfig heartbeat interval', () => {
    beforeEach(() => {
        vi.mocked(readConfig).mockResolvedValue(minimalPlatformConfig as never)
    })

    it('defaults statsLoggingIntervalMs to 10 seconds when heartbeatInterval omitted', async () => {
        const config = await safeReadConfig()

        expect(config.statsLoggingIntervalMs).toBe(10_000)
    })

    it('converts heartbeatInterval seconds from platform config to statsLoggingIntervalMs', async () => {
        vi.mocked(readConfig).mockResolvedValue({
            ...minimalPlatformConfig,
            heartbeatInterval: 30,
        } as never)

        const config = await safeReadConfig()

        expect(config.statsLoggingIntervalMs).toBe(30_000)
    })
})




