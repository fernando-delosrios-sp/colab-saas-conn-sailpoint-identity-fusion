import type { Mock } from 'vitest'
import { FusionConfig } from '../../../model/config'
import { LogService } from '../../logService'

const { agentOptions, AgentMock, configurationArgs, ConfigurationMock, apiConfigByCtor } = vi.hoisted(() => {
    const agentOptions: Record<string, unknown>[] = []
    const AgentMock = vi.fn(function (this: { options: Record<string, unknown> }, options: Record<string, unknown>) {
        agentOptions.push(options)
        this.options = options
    })

    const configurationArgs: Record<string, unknown>[] = []
    const ConfigurationMock = vi.fn(function (
        this: { baseOptions?: { httpsAgent?: unknown }; retriesConfig?: unknown },
        config: Record<string, unknown>
    ) {
        configurationArgs.push(config)
        Object.assign(this, config)
        return this
    })

    const apiConfigByCtor = new Map<Mock, unknown>()

    return { agentOptions, AgentMock, configurationArgs, ConfigurationMock, apiConfigByCtor }
})

function mockApiCtor() {
    return vi.fn(function (this: { config: unknown }, config: unknown) {
        apiConfigByCtor.set(this as unknown as Mock, config)
        this.config = config
        return this
    })
}

vi.mock('https', () => ({
    default: { Agent: AgentMock },
    Agent: AgentMock,
}))

vi.mock('sailpoint-api-client', () => ({
    Configuration: ConfigurationMock,
    AccountsV2025Api: mockApiCtor(),
    IdentitiesV2025Api: mockApiCtor(),
    SearchApi: mockApiCtor(),
    SourcesV2025Api: mockApiCtor(),
    CustomFormsV2025Api: mockApiCtor(),
    WorkflowsV2025Api: mockApiCtor(),
    EntitlementsV2025Api: mockApiCtor(),
    TransformsApi: mockApiCtor(),
    GovernanceGroupsV2025Api: mockApiCtor(),
    TaskManagementV2025Api: mockApiCtor(),
    IdentityProfilesV2025Api: mockApiCtor(),
    IdentityAttributesV2025Api: mockApiCtor(),
}))

import { SdkApiAdapter } from '../sdkApiAdapter'

describe('SdkApiAdapter', () => {
    const fusionConfig = {
        baseurl: 'https://tenant.identitynow.com',
        tokenUrlPath: '/oauth/token',
    } as FusionConfig

    const log = {} as LogService

    beforeEach(() => {
        agentOptions.length = 0
        configurationArgs.length = 0
        apiConfigByCtor.clear()
        vi.clearAllMocks()
    })

    it('constructs a bounded keep-alive https agent', () => {
        new SdkApiAdapter(fusionConfig, log)

        expect(AgentMock).toHaveBeenCalledOnce()
        expect(agentOptions[0]).toEqual({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 50,
            maxFreeSockets: 10,
            timeout: 60000,
        })
    })

    it('injects the shared agent into Configuration.baseOptions.httpsAgent', () => {
        const adapter = new SdkApiAdapter(fusionConfig, log)

        const agentInstance = AgentMock.mock.instances[0]
        expect(configurationArgs[0]?.baseOptions).toEqual({ httpsAgent: agentInstance })
        expect((adapter.config as { baseOptions?: { httpsAgent?: unknown } }).baseOptions?.httpsAgent).toBe(agentInstance)
    })

    it('reuses the same Configuration for lazy-loaded SDK API getters', () => {
        const adapter = new SdkApiAdapter(fusionConfig, log)

        const accountsApi = adapter.accountsApi
        const searchApi = adapter.searchApi

        expect(accountsApi.config).toBe(adapter.config)
        expect(searchApi.config).toBe(adapter.config)
    })
})
