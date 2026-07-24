import type { Mock } from 'vitest'
import { FusionConfig } from '../../../model/config'
import { LogService } from '../../logService'

const { agentOptions, AgentMock, configurationArgs, ConfigurationMock, apiConfigByCtor, axiosCreateMock, requestInterceptor } = vi.hoisted(() => {
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
    let requestInterceptor: (config: Record<string, unknown>) => Record<string, unknown> = (config) => config
    const axiosInstance = {
        interceptors: {
            request: {
                use: vi.fn((fn: typeof requestInterceptor) => {
                    requestInterceptor = fn
                }),
            },
        },
    }
    const axiosCreateMock = vi.fn(() => axiosInstance)

    return { agentOptions, AgentMock, configurationArgs, ConfigurationMock, apiConfigByCtor, axiosCreateMock, requestInterceptor: () => requestInterceptor }
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

vi.mock('axios', () => ({
    default: {
        create: axiosCreateMock,
    },
}))

vi.mock('../helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../helpers')>()
    return {
        ...actual,
        getRequestAbortSignal: vi.fn(),
    }
})

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
import { getRequestAbortSignal } from '../helpers'

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

    it('registers a dedicated axios instance with request interceptor', () => {
        new SdkApiAdapter(fusionConfig, log)

        expect(axiosCreateMock).toHaveBeenCalledOnce()
    })

    it('applies abort signal from AsyncLocalStorage to axios request config', () => {
        const controller = new AbortController()
        vi.mocked(getRequestAbortSignal).mockReturnValue(controller.signal)

        const adapter = new SdkApiAdapter(fusionConfig, log)
        adapter.accountsApi

        const config = { headers: {} }
        const result = requestInterceptor()(config)

        expect(result.signal).toBe(controller.signal)
    })

    it('leaves axios request config unchanged when no abort signal is active', () => {
        vi.mocked(getRequestAbortSignal).mockReturnValue(undefined)

        const adapter = new SdkApiAdapter(fusionConfig, log)
        adapter.accountsApi

        const config = { headers: {} }
        const result = requestInterceptor()(config)

        expect(result.signal).toBeUndefined()
    })
})

