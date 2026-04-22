import { fetchPhase, outputPhase, refreshPhase, processPhase, uniqueAttributesPhase } from '../corePipeline'

function createRegistry() {
    const forms = {
        fetchFormInstancesData: jest.fn().mockResolvedValue(undefined),
        processFetchedFormData: jest.fn().mockResolvedValue(undefined),
        cleanUpForms: jest.fn().mockResolvedValue(undefined),
        awaitPendingDeleteOperations: jest.fn().mockResolvedValue(undefined),
    }

    const fusion = {
        clearAnalyzedAccounts: jest.fn(),
        forEachISCAccount: jest.fn().mockResolvedValue(0),
    }

    const sources = {
        clearManagedAccounts: jest.fn(),
        clearFusionAccounts: jest.fn(),
        saveBatchCumulativeCount: jest.fn().mockResolvedValue(undefined),
        aggregateDelayedSources: jest.fn().mockResolvedValue(undefined),
    }

    const attributes = {
        saveState: jest.fn().mockResolvedValue(undefined),
    }

    const messaging = {
        scheduleDelayedAggregation: jest.fn().mockResolvedValue(undefined),
    }

    return {
        registry: {
            log: { info: jest.fn() },
            fusion,
            forms,
            sources,
            attributes,
            messaging,
            res: { send: jest.fn() },
        } as any,
        forms,
        fusion,
    }
}

describe('corePipeline phase split', () => {
    it('runs refresh before process before unique attributes with correct side-effect order', async () => {
        const callOrder: string[] = []
        const fusion = {
            processFusionAccounts: jest.fn(async () => {
                callOrder.push('processFusionAccounts')
            }),
            processIdentities: jest.fn(async () => {
                callOrder.push('processIdentities')
            }),
            processFusionIdentityDecisions: jest.fn(async () => {
                callOrder.push('processFusionIdentityDecisions')
            }),
            processManagedAccounts: jest.fn(async () => {
                callOrder.push('processManagedAccounts')
            }),
            awaitPendingDisableOperations: jest.fn(async () => {
                callOrder.push('awaitPendingDisableOperations')
            }),
            reconcilePendingFormState: jest.fn(() => {
                callOrder.push('reconcilePendingFormState')
            }),
            refreshUniqueAttributes: jest.fn(async () => {
                callOrder.push('refreshUniqueAttributes')
            }),
        }
        const identities = { clear: jest.fn(() => callOrder.push('identities.clear')) }
        const sources = { managedAccountsById: new Map() }
        const log = { info: jest.fn() }
        const registry = { fusion, identities, sources, log } as any

        await refreshPhase(registry, { mode: { kind: 'aggregation' } })
        await processPhase(registry, { mode: { kind: 'aggregation' } })
        await uniqueAttributesPhase(registry, { mode: { kind: 'aggregation' } })

        expect(callOrder).toEqual([
            'processFusionAccounts',
            'processIdentities',
            'processFusionIdentityDecisions',
            'identities.clear',
            'processManagedAccounts',
            'awaitPendingDisableOperations',
            'reconcilePendingFormState',
            'refreshUniqueAttributes',
        ])
    })
})

describe('corePipeline outputPhase', () => {
    it('drains queued form deletions before persistent pipeline exit', async () => {
        const { registry, forms } = createRegistry()

        await outputPhase(registry, { mode: { kind: 'aggregation' } })

        expect(forms.cleanUpForms).toHaveBeenCalledTimes(1)
        expect(forms.awaitPendingDeleteOperations).toHaveBeenCalledTimes(1)
        expect(forms.cleanUpForms.mock.invocationCallOrder[0]).toBeLessThan(
            forms.awaitPendingDeleteOperations.mock.invocationCallOrder[0]
        )
    })

    it('skips form cleanup for non-persistent mode', async () => {
        const { registry, forms, fusion } = createRegistry()
        fusion.forEachISCAccount.mockResolvedValue(2)

        await outputPhase(registry, { mode: { kind: 'dry-run' } })

        expect(forms.cleanUpForms).not.toHaveBeenCalled()
        expect(forms.awaitPendingDeleteOperations).not.toHaveBeenCalled()
    })

    it('passes stale cleanup flag only for persistent fetch runs', async () => {
        const { registry, forms } = createRegistry()
        const identities = { fetchIdentities: jest.fn().mockResolvedValue(undefined), identityCount: 0, getIdentityById: jest.fn() }
        const sources = {
            fetchManagedAccounts: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
            managedAccountsById: new Map(),
            managedSources: [],
            getSourceByNameSafe: jest.fn(),
            fusionAccountCount: 0,
            fetchGlobalOwnerIdentityIds: jest.fn().mockResolvedValue([]),
        }
        const fusion = { fusionReportOnAggregation: false, fusionOwnerIsGlobalReviewer: false }
        const messaging = { fetchSender: jest.fn().mockResolvedValue(undefined), fetchDelayedAggregationSender: jest.fn().mockResolvedValue(undefined) }
        const log = { info: jest.fn() }
        const serviceRegistry = { ...registry, forms, identities, sources, fusion, messaging, log }

        await fetchPhase(serviceRegistry, { mode: { kind: 'aggregation' } })
        expect(forms.fetchFormInstancesData).toHaveBeenCalledWith(true)

        forms.fetchFormInstancesData.mockClear()
        await fetchPhase(serviceRegistry, { mode: { kind: 'dry-run' } })
        expect(forms.fetchFormInstancesData).toHaveBeenCalledWith(false)
    })
})
