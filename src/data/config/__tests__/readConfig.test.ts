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
