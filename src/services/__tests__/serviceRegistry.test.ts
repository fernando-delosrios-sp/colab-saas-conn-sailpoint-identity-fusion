import { ServiceRegistry } from '../serviceRegistry'
import { ClientService } from '../clientService'
import { DryRunApiAdapter } from '../clientService/dryRunApiAdapter'
import { IscApiAdapter } from '../clientService/iscApiAdapter'
import { FusionConfig } from '../../model/config'
import { createTestRegistry } from '../../operations/__tests__/harness/testRegistry'

vi.mock('../clientService/sdkApiAdapter', () => ({
    SdkApiAdapter: class MockSdkApiAdapter {
        config = {}
        accountsApi = {}
        identitiesApi = {}
        searchApi = {}
        sourcesApi = {}
        customFormsApi = {}
        workflowsApi = {}
        entitlementsApi = {}
        transformsApi = {}
        governanceGroupsApi = {}
        taskManagementApi = {}
        identityProfilesApi = {}
        identityAttributesApi = {}
    },
}))

function minimalConfig(overrides: Partial<FusionConfig> = {}): FusionConfig {
    return {
        sources: [{ name: 'fusion', correlationMode: 'none' }],
        baseurl: 'https://test.example.com',
        spConnectorInstanceId: 'test-instance',
        recording: { mode: 'off' },
        ...overrides,
    } as unknown as FusionConfig
}

describe('ServiceRegistry.activateDryRunMode', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('wraps the live client adapter with DryRunApiAdapter', () => {
        const wrapSpy = vi.spyOn(ClientService.prototype, 'wrapAdapter')
        const registry = new ServiceRegistry(minimalConfig(), {} as any, { send: vi.fn() } as any, 'accountList')

        registry.activateDryRunMode()

        expect(registry.run.isDryRunMode).toBe(true)
        expect(wrapSpy).toHaveBeenCalledTimes(1)
        const wrapFn = wrapSpy.mock.calls[0][0]
        const inner = { config: {} as any } as IscApiAdapter
        expect(wrapFn(inner)).toBeInstanceOf(DryRunApiAdapter)
    })

    it('does not wrap when the client was injected via context.connectionService', () => {
        const wrapSpy = vi.spyOn(ClientService.prototype, 'wrapAdapter')
        const registry = createTestRegistry({ sourceConfigs: [{ name: 'fusion', correlationMode: 'none' }] })

        registry.activateDryRunMode()

        expect(wrapSpy).not.toHaveBeenCalled()
    })

    it('inhibits write calls on the wrapped adapter after activation', async () => {
        const inner: IscApiAdapter = {
            config: {} as any,
            accountsApi: {
                listAccounts: vi.fn().mockResolvedValue({ data: [{ id: 'acct-1' }] }),
                updateAccount: vi.fn().mockResolvedValue({ data: { id: 'acct-1' } }),
            } as any,
            identitiesApi: {} as any,
            searchApi: {} as any,
            sourcesApi: {} as any,
            customFormsApi: {} as any,
            workflowsApi: {} as any,
            entitlementsApi: {} as any,
            transformsApi: {} as any,
            governanceGroupsApi: {} as any,
            taskManagementApi: {} as any,
            identityProfilesApi: {} as any,
            identityAttributesApi: {} as any,
        }
        const client = new ClientService(inner, null, minimalConfig(), {
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            setQueue: vi.fn(),
        } as any)
        client.wrapAdapter((adapter) => new DryRunApiAdapter(adapter))

        await (client.accountsApi as any).updateAccount({ id: 'acct-1' })

        expect(inner.accountsApi.updateAccount).not.toHaveBeenCalled()
    })
})


