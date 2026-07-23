import { accountList } from '../accountList'
import { aggregationScenarios } from './fixtures/aggregationScenarios'
import { AggregationScenario } from './fixtures/scenarioTypes'
import { createOperationTestRegistry } from './harness/operationTestRegistry'
import type { Mock } from 'vitest'

function createMockRegistry(sourceConfigs: any[]) {
    const registry = createOperationTestRegistry({
        sourceConfigs,
    })
    const sources = registry.sources as any
    const schemas = registry.schemas as any
    const identities = registry.identities as any
    const fusion = registry.fusion as any
    return { registry, schemas, sources, identities, fusion }
}

function createTwoSweepRegistry(scenario: AggregationScenario) {
    const currentSweep = { value: 'sweep1' as 'sweep1' | 'sweep2' }
    const dataBySweep = scenario.sweepData
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
        const sweepData = dataBySweep[currentSweep.value]
        const map = new Map<string, { id: string; sourceName: string }>()
        for (const account of sweepData.managedAccounts) {
            map.set(account.id, account)
        }
        sources.run.managedAccountsById = map
        sources.managedAccountsAllById = new Map(map)
    })

    sources.fusionAccountCount = 2
    identities.fetchIdentities.mockImplementation(async () => {
        identities.identityCount = dataBySweep[currentSweep.value].identitiesFound
    })

    forms.processFetchedFormData.mockImplementation(async () => {
        decisionHistory.push([...dataBySweep[currentSweep.value].decisions])
    })

    fusion.forEachISCAccount.mockImplementation(async (sendFn: (account: unknown) => void) => {
        const output = dataBySweep[currentSweep.value].outputAccounts
        for (const account of output) {
            sendFn(account)
        }
        return { sent: output.length, eligible: output.length }
    })

    fusion.streamAndClearEligibleAccounts.mockImplementation(async () => {
        return { sent: 0, eligible: 0 }
    })

    return {
        registry,
        sources,
        forms,
        identities,
        fusion,
        res,
        decisionHistory,
        setSweep: (sweep: 'sweep1' | 'sweep2') => {
            currentSweep.value = sweep
        },
    }
}

describe('accountList setup phase', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('refreshes schema after reverse-correlation setup so new attributes are retained', async () => {
        const reverseSource = {
            name: 'HR Source',
            correlationMode: 'reverse' as const,
            correlationAttribute: 'hrNativeIdentity',
            correlationDisplayName: 'HR Native Identity',
        }
        const { registry, schemas, sources } = createMockRegistry([reverseSource])
        sources.setupReverseCorrelationSources = vi.fn().mockResolvedValue(1)
        const input = { schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(sources.clearReverseCorrelationReadinessCache).toHaveBeenCalledTimes(1)
        expect(sources.setupReverseCorrelationSources).toHaveBeenCalledTimes(1)
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
        expect(sources.setupReverseCorrelationSources).toHaveBeenCalledTimes(1)
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

        await accountList(registry, input)

        expect(sources.setupReverseCorrelationSources).toHaveBeenCalledTimes(1)
    })

    it('passes global owner ids to fetchIdentities when fusionOwnerIsGlobalReviewer', async () => {
        const { registry, sources, identities, fusion } = createMockRegistry([])
        const input = { schema: { attributes: [] } } as any

        ;(fusion as any).fusionOwnerIsGlobalReviewer = true
        const globalOwnerIds = Array.from({ length: 61 }, (_, i) => `identity-${i + 1}`)
        ;(sources as any).fetchGlobalOwnerIdentityIds = vi.fn().mockResolvedValue(globalOwnerIds)

        await accountList(registry, input)

        expect((sources as any).fetchGlobalOwnerIdentityIds).toHaveBeenCalledTimes(1)
        expect(identities.fetchIdentities).toHaveBeenCalledWith(globalOwnerIds)
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
        const workflows = registry.workflows
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

        expect(workflows.fetchDelayedAggregationSender).toHaveBeenCalledTimes(1)
        expect(workflows.scheduleDelayedAggregation).toHaveBeenCalledWith({
            sourceId: 'source-1',
            delayMinutes: 7,
            disableOptimization: true,
        })
    })
})

describe('accountList two-sweep aggregation lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.each(aggregationScenarios)('$name', async (scenario) => {
        const { registry, sources, forms, fusion, res, decisionHistory, setSweep } = createTwoSweepRegistry(scenario)
        const input = { schema: { attributes: [] } } as any

        setSweep('sweep1')
        await accountList(registry, input)

        expect(forms.fetchFormInstances).toHaveBeenCalledTimes(1)
        expect(forms.processFetchedFormData).toHaveBeenCalledTimes(1)
        expect(fusion.processFusionIdentityDecisions).toHaveBeenCalledTimes(1)
        expect(sources.releaseProcessLock).toHaveBeenCalledTimes(1)
        expect(res.send).toHaveBeenCalledTimes(scenario.sweepData.sweep1.outputAccounts.length)
        ;(res.send as Mock).mockClear()
        setSweep('sweep2')
        await accountList(registry, input)

        expect(forms.fetchFormInstances).toHaveBeenCalledTimes(2)
        expect(forms.processFetchedFormData).toHaveBeenCalledTimes(2)
        expect(fusion.processFusionIdentityDecisions).toHaveBeenCalledTimes(2)
        expect(sources.releaseProcessLock).toHaveBeenCalledTimes(2)
        expect(decisionHistory).toEqual([scenario.sweepData.sweep1.decisions, scenario.sweepData.sweep2.decisions])
        expect(res.send).toHaveBeenCalledTimes(scenario.sweepData.sweep2.outputAccounts.length)
    })
})

describe('accountList dry-run mode', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('runs non-persistently and sends terminal summary when dryRun.enabled is true', async () => {
        const { registry, sources } = createMockRegistry([])
        const res = registry.res
        const input = { dryRun: { enabled: true }, schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(sources.setProcessLock).not.toHaveBeenCalled()
        expect(sources.releaseProcessLock).not.toHaveBeenCalled()
        expect(res.send).toHaveBeenCalledWith(
            expect.objectContaining({
                rowsSent: expect.any(Number),
                identitiesFound: expect.any(Number),
                managedAccountsFound: expect.any(Number),
                totalProcessingTime: expect.any(String),
                issueSummary: expect.any(Object),
                options: expect.objectContaining({ saveFile: false, sendEmail: false }),
            })
        )
    })

    it('skips summary-only options when dryRun.enabled is absent', async () => {
        const { registry, sources } = createMockRegistry([])
        const input = { dryRun: { saveFile: true }, schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(sources.setProcessLock).toHaveBeenCalledTimes(1)
        expect(sources.releaseProcessLock).toHaveBeenCalledTimes(1)
    })
})
