import { ServiceRegistry } from '../serviceRegistry'
import { ClientService } from '../clientService'
import { DryRunApiAdapter } from '../clientService/dryRunApiAdapter'
import { IscApiAdapter } from '../clientService/iscApiAdapter'
import { FusionConfig } from '../../model/config'
import { FusionAccount } from '../../model/account'
import { AggregationTracker } from '../../model/aggregationTracker'
import { MatchCandidateType } from '../matchingService/types'
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

describe('ServiceRegistry context overrides', () => {
    it('uses a ReportService provided on context instead of constructing one', () => {
        const reportService = { id: 'injected-report-service' }

        const registry = new ServiceRegistry(
            minimalConfig(),
            { reportService } as any,
            { send: vi.fn() } as any,
            'accountList'
        )

        expect(registry.reports).toBe(reportService)
    })

    it('streams and marks an auto-merged account emitted during early account emission', async () => {
        const send = vi.fn()
        const registry = new ServiceRegistry(
            minimalConfig({
                fusionDropAccountsAfterEmit: true,
                fusionEnableAutoMerge: true,
                fusionAutoMergeScore: 100,
            }),
            {} as any,
            { send } as any,
            'accountList'
        )
        registry.run.setTracker(new AggregationTracker())
        const identity = FusionAccount.fromIdentity({
            id: 'identity-early',
            name: 'Early Identity',
            attributes: {},
        } as any)
        registry.run.registerFusionAccount(identity)
        registry.matching.buildTrigramIndex(registry.run.allFusionIdentities)
        registry.run.markFusionAccountEmitted(identity)
        registry.run.clearEmittedFusionAccounts()

        const updatedAccount = FusionAccount.fromIdentity({
            id: 'identity-early',
            name: 'Early Identity',
            attributes: { email: 'managed@example.com' },
        } as any)
        const output = { key: { simple: { id: 'identity-early' } }, attributes: {}, disabled: false }
        vi.spyOn(registry.matching, 'scoreFusionAccount').mockImplementation(async (account, _pool, type) => {
            if (type === MatchCandidateType.Identity) {
                account.layers.addFusionMatch({
                    identityId: 'identity-early',
                    identityName: 'Early Identity',
                    candidateType: 'identity',
                    scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 100, isMatch: true }],
                })
            }
            return 1
        })
        vi.spyOn(registry.fusion.decisionProcessor, 'processFusionIdentityDecision').mockResolvedValue(updatedAccount)
        vi.spyOn(registry.fusion, 'getISCAccount').mockResolvedValue(output as any)
        registry.run.sourcesByName.set('Source A', {
            id: 'source-a-id',
            name: 'Source A',
            isManaged: true,
            sourceType: 'authoritative',
            config: {},
        } as any)

        await registry.matchOutcomeDispatcher.runMatchSweep(
            [
                {
                    id: 'managed-1',
                    name: 'Managed Account',
                    sourceId: 'source-a-id',
                    sourceName: 'Source A',
                    nativeIdentity: 'native-1',
                    attributes: {},
                    uncorrelated: true,
                } as any,
            ],
            1
        )

        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(updatedAccount, true)
        expect(send).toHaveBeenCalledWith(output)
        expect(registry.run.isAccountEmitted('identity-early')).toBe(true)
    })
})

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

        expect(registry.run.isDryRunMode).toBe(true)
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
            machineAccountsApi: {} as any,
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

