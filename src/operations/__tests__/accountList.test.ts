import { accountList } from '../accountList'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { aggregationScenarios } from './fixtures/aggregationScenarios'
import { AggregationScenario } from './fixtures/scenarioTypes'
import { createBaseOperationRegistry, SourceConfigLike } from './harness/mockRegistry'

function createMockRegistry(sourceConfigs: SourceConfigLike[]) {
    const { registry, schemas, sources, identities, fusion } = createBaseOperationRegistry(sourceConfigs)
    return { registry, schemas, sources, identities, fusion }
}

function createTwoPassRegistry(scenario: AggregationScenario) {
    const currentPass = { value: 'pass1' as 'pass1' | 'pass2' }
    const dataByPass = scenario.passData
    const decisionHistory: string[][] = []

    const { registry, sources } = createMockRegistry(scenario.sourceConfigs)
    const forms = registry.forms
    const identities = registry.identities
    const fusion = registry.fusion
    const res = registry.res

    sources.getSourceByName.mockImplementation((sourceName: string) =>
        scenario.sourceConfigs.find((sc) => sc.name === sourceName)
    )

    sources.fetchManagedAccounts.mockImplementation(async () => {
        const passData = dataByPass[currentPass.value]
        const map = new Map<string, { id: string; sourceName: string }>()
        for (const account of passData.managedAccounts) {
            map.set(account.id, account)
        }
        sources.managedAccountsById = map
        sources.managedAccountsAllById = new Map(map)
    })

    sources.fusionAccountCount = 2
    identities.fetchIdentities.mockImplementation(async () => {
        identities.identityCount = dataByPass[currentPass.value].identitiesFound
    })

    forms.processFetchedFormData.mockImplementation(async () => {
        decisionHistory.push([...dataByPass[currentPass.value].decisions])
    })

    fusion.forEachISCAccount.mockImplementation(async (sendFn: (account: unknown) => void) => {
        const output = dataByPass[currentPass.value].outputAccounts
        for (const account of output) {
            sendFn(account)
        }
        return output.length
    })

    return {
        registry,
        sources,
        forms,
        identities,
        fusion,
        res,
        decisionHistory,
        setPass: (pass: 'pass1' | 'pass2') => {
            currentPass.value = pass
        },
    }
}

describe('accountList setup phase', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('refreshes schema after reverse-correlation setup so new attributes are retained', async () => {
        const reverseSource = {
            name: 'HR Source',
            correlationMode: 'reverse' as const,
            correlationAttribute: 'hrNativeIdentity',
            correlationDisplayName: 'HR Native Identity',
        }
        const { registry, schemas, sources } = createMockRegistry([reverseSource])
        const input = { schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(sources.clearReverseCorrelationReadinessCache).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledWith(reverseSource, expect.any(Set))
        expect(schemas.setFusionAccountSchema).toHaveBeenNthCalledWith(1, input.schema)
        expect(schemas.setFusionAccountSchema).toHaveBeenNthCalledWith(2, undefined)
    })

    it('does not reload schema when no reverse-correlation source is configured', async () => {
        const correlateSource = {
            name: 'IT Source',
            correlationMode: 'correlate' as const,
        }
        const { registry, schemas, sources } = createMockRegistry([correlateSource])
        const input = { schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(sources.clearReverseCorrelationReadinessCache).toHaveBeenCalledTimes(1)
        expect(sources.ensureReverseCorrelationSetup).not.toHaveBeenCalled()
        expect(schemas.setFusionAccountSchema).toHaveBeenCalledTimes(1)
        expect(schemas.setFusionAccountSchema).toHaveBeenCalledWith(input.schema)
    })

    it('runs reverse-correlation setup sequentially across multiple sources', async () => {
        const reverseSources = [
            {
                name: 'Source A',
                correlationMode: 'reverse' as const,
                correlationAttribute: 'attrA',
                correlationDisplayName: 'Attr A',
            },
            {
                name: 'Source B',
                correlationMode: 'reverse' as const,
                correlationAttribute: 'attrB',
                correlationDisplayName: 'Attr B',
            },
        ]
        const { registry, sources } = createMockRegistry(reverseSources)
        const input = { schema: { attributes: [] } } as any

        let inFlight = 0
        let maxInFlight = 0
        sources.ensureReverseCorrelationSetup.mockImplementation(async () => {
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 5))
            inFlight--
        })

        await accountList(registry, input)

        expect(sources.ensureReverseCorrelationSetup).toHaveBeenCalledTimes(2)
        expect(maxInFlight).toBe(1)
    })

    it('hydrates missing global owners with bounded concurrency', async () => {
        const { registry, sources, identities, fusion } = createMockRegistry([])
        const input = { schema: { attributes: [] } } as any

        ;(fusion as any).fusionOwnerIsGlobalReviewer = true
        const globalOwnerIds = Array.from({ length: 61 }, (_, i) => `identity-${i + 1}`)
        ;(sources as any).fetchGlobalOwnerIdentityIds = jest.fn().mockResolvedValue(globalOwnerIds)
        identities.getIdentityById.mockReturnValue(undefined)

        let inFlight = 0
        let maxInFlight = 0
        identities.fetchIdentityById.mockImplementation(async () => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 1))
            inFlight -= 1
        })

        await accountList(registry, input)

        expect((sources as any).fetchGlobalOwnerIdentityIds).toHaveBeenCalledTimes(1)
        expect(identities.fetchIdentityById).toHaveBeenCalledTimes(globalOwnerIds.length)
        expect(maxInFlight).toBeLessThanOrEqual(25)
    })

    it('schedules delayed aggregation via workflow callback path', async () => {
        const delayedSource = {
            name: 'HR Source',
            correlationMode: 'none' as const,
            aggregationMode: 'delayed' as const,
            aggregationDelay: 7,
            optimizedAggregation: false,
        }
        const { registry, sources } = createMockRegistry([delayedSource])
        const messaging = registry.messaging
        const input = { schema: { attributes: [] } } as any

        sources.managedSources = [
            {
                id: 'source-1',
                name: delayedSource.name,
                config: {
                    aggregationMode: delayedSource.aggregationMode,
                    aggregationDelay: delayedSource.aggregationDelay,
                    optimizedAggregation: delayedSource.optimizedAggregation,
                },
            },
        ] as any

        sources.aggregateDelayedSources.mockImplementation(async (schedule: any) => {
            await schedule({
                sourceId: 'source-1',
                delayMinutes: 7,
                disableOptimization: true,
            })
        })

        await accountList(registry, input)

        expect(messaging.fetchDelayedAggregationSender).toHaveBeenCalledTimes(1)
        expect(messaging.scheduleDelayedAggregation).toHaveBeenCalledWith({
            sourceId: 'source-1',
            delayMinutes: 7,
            disableOptimization: true,
        })
    })
})

describe('accountList two-pass aggregation lifecycle', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it.each(aggregationScenarios)('$name', async (scenario) => {
        const { registry, sources, forms, fusion, res, decisionHistory, setPass } = createTwoPassRegistry(scenario)
        const input = { schema: { attributes: [] } } as any

        setPass('pass1')
        await accountList(registry, input)

        expect(forms.fetchFormInstancesData).toHaveBeenCalledTimes(1)
        expect(forms.processFetchedFormData).toHaveBeenCalledTimes(1)
        expect(fusion.processFusionIdentityDecisions).toHaveBeenCalledTimes(1)
        expect(sources.releaseProcessLock).toHaveBeenCalledTimes(1)
        expect(res.send).toHaveBeenCalledTimes(scenario.passData.pass1.outputAccounts.length)

        ;(res.send as jest.Mock).mockClear()
        setPass('pass2')
        await accountList(registry, input)

        expect(forms.fetchFormInstancesData).toHaveBeenCalledTimes(2)
        expect(forms.processFetchedFormData).toHaveBeenCalledTimes(2)
        expect(fusion.processFusionIdentityDecisions).toHaveBeenCalledTimes(2)
        expect(sources.releaseProcessLock).toHaveBeenCalledTimes(2)
        expect(decisionHistory).toEqual([scenario.passData.pass1.decisions, scenario.passData.pass2.decisions])
        expect(res.send).toHaveBeenCalledTimes(scenario.passData.pass2.outputAccounts.length)
    })
})
