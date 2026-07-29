import { readConfig } from '@sailpoint/connector-sdk'
import { safeReadConfig } from '../readConfig'

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

