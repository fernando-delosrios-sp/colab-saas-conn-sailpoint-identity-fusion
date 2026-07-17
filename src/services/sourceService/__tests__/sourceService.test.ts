import { SourceService } from '../sourceService'
import { buildIdentityAttributeCreateErrorMessage } from '../sourceReverseCorrelationErrors'
import { SourceInfo } from '../types'
import { SourceType } from '../../../model/config'

const createService = (sourceConfigOverrides: Record<string, unknown> = {}) => {
    const config: any = {
        sources: [
            {
                name: 'HR Source',
                sourceType: SourceType.Authoritative,
                ...sourceConfigOverrides,
            },
        ],
        spConnectorInstanceId: 'fusion-id',
        concurrencyCheckEnabled: true,
        batchCumulativeCount: {},
        attributeMaps: [],
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
    }
    const log: any = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
    const client: any = {
        execute: async (fn: () => Promise<any>) => fn(),
        paginate: vi.fn(),
        paginateParallel: vi.fn(),
        accountsApi: {
            listAccounts: vi.fn(),
        },
        sourcesApi: {
            importAccounts: vi.fn(),
        },
        taskManagementApi: {
            getTaskStatus: vi.fn(),
        },
    }

    const service = new SourceService(config, log, client)
    const sourceInfo: SourceInfo = {
        id: 'managed-source-id',
        name: 'HR Source',
        isManaged: true,
        sourceType: (sourceConfigOverrides.sourceType as SourceInfo['sourceType']) ?? SourceType.Authoritative,
        config: config.sources[0],
    }
    ;(service as any)._allSources = [sourceInfo]
    ;(service as any).sourcesById = new Map([[sourceInfo.id, sourceInfo]])
    ;(service as any).sourcesByName = new Map([[sourceInfo.name, sourceInfo]])

    return { service, client, sourceInfo, log }
}

describe('SourceService Accounts JMESPath filter', () => {
    it('filters managed accounts page-wise during fetchManagedAccounts', async () => {
        const { service, sourceInfo } = createService({
            accountJmespathFilter: 'accounts[?attributes.department == `Engineering`]',
        })

        vi.spyOn(service, 'fetchAccountsBySourceIdGenerator').mockImplementation(async function* () {
            yield [
                {
                    id: 'a1',
                    identityId: 'i1',
                    sourceId: 'managed-source-id',
                    nativeIdentity: 'eng-1',
                    attributes: { department: 'Engineering' },
                } as any,
                {
                    id: 'a2',
                    identityId: 'i2',
                    sourceId: 'managed-source-id',
                    nativeIdentity: 'fin-1',
                    attributes: { department: 'Finance' },
                } as any,
            ]
        })
        ;(service as any)._allSources = [sourceInfo]
        await service.fetchManagedAccounts()

        expect(service.managedAccountsById.size).toBe(1)
        expect(service.managedAccountsById.has('managed-source-id::eng-1')).toBe(true)
        expect(service.managedAccountsById.has('managed-source-id::fin-1')).toBe(false)
    })

    it('rejects invalid JMESPath expressions in validation', () => {
        const { service } = createService({
            accountJmespathFilter: 'accounts[?',
        })

        expect(() => service.validateAccountJmespathFilters()).toThrow(
            'Invalid Accounts JMESPath filter for source "HR Source"'
        )
    })
})

describe('SourceService per-source aggregation polling', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('on zero-minute timeout performs one status check then warns with timeout fields', async () => {
        vi.useFakeTimers({ now: 0 })
        const { service, client } = createService({
            aggregationMode: 'before',
            aggregationTimeout: 0,
        })

        client.sourcesApi.importAccounts.mockResolvedValue({
            data: { task: { id: 'task-1' } },
        })
        client.taskManagementApi.getTaskStatus.mockResolvedValue({
            data: { completed: false, completionStatus: 'IN_PROGRESS' },
        })

        const promise = (service as any).aggregateManagedSource('managed-source-id', false, true)
        await Promise.resolve()
        await promise

        expect(client.taskManagementApi.getTaskStatus).toHaveBeenCalledTimes(1)
        expect((service as any).log.warn).toHaveBeenCalledWith(
            expect.stringMatching(/timeoutMinutes=0, pollIntervalMs=30000, pollsExecuted=1/)
        )
    })

    it('after one poll interval hits timeout with two polls executed', async () => {
        vi.useFakeTimers({ now: 0 })
        const { service, client } = createService({
            aggregationMode: 'before',
            aggregationTimeout: 1,
        })

        client.sourcesApi.importAccounts.mockResolvedValue({
            data: { task: { id: 'task-1' } },
        })
        client.taskManagementApi.getTaskStatus.mockResolvedValue({
            data: { completed: false, completionStatus: 'IN_PROGRESS' },
        })

        const promise = (service as any).aggregateManagedSource('managed-source-id', false, true)
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(30_000)
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(30_000)
        await Promise.resolve()
        await promise

        expect(client.taskManagementApi.getTaskStatus).toHaveBeenCalledTimes(2)
        expect((service as any).log.warn).toHaveBeenCalledWith(
            expect.stringMatching(/timeoutMinutes=1, pollIntervalMs=30000, pollsExecuted=2/)
        )
    })

    it('stops polling when task completes before timeout', async () => {
        vi.useFakeTimers({ now: 0 })
        const { service, client } = createService({
            aggregationMode: 'before',
            aggregationTimeout: 10,
        })

        client.sourcesApi.importAccounts.mockResolvedValue({
            data: { task: { id: 'task-1' } },
        })
        client.taskManagementApi.getTaskStatus
            .mockResolvedValueOnce({
                data: { completed: false, completionStatus: 'IN_PROGRESS' },
            })
            .mockResolvedValueOnce({
                data: { completed: true, completionStatus: 'SUCCESS' },
            })

        const promise = (service as any).aggregateManagedSource('managed-source-id', false, true)
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(30_000)
        await Promise.resolve()
        await promise

        expect(client.taskManagementApi.getTaskStatus).toHaveBeenCalledTimes(2)
        expect((service as any).log.warn).not.toHaveBeenCalled()
    })
})

describe('SourceService fetchManagedAccount (sourceId + nativeIdentity)', () => {
    it('warns and skips when sourceId is not a configured managed source', async () => {
        const { service, log } = createService()

        await service.fetchManagedAccount('unknown-source-id', 'user-1')

        expect(service.managedAccountsById.size).toBe(0)
        expect(log.warn).toHaveBeenCalledWith(
            expect.stringContaining('non-configured or non-managed source "unknown-source-id"')
        )
    })

    it('loads one account via filtered listAccounts and indexes by composite key', async () => {
        const { service, client } = createService()
        client.accountsApi.listAccounts.mockResolvedValue({
            data: [
                {
                    id: 'plat-1',
                    identityId: 'id-1',
                    sourceId: 'managed-source-id',
                    nativeIdentity: 'user-1',
                    sourceName: 'HR Source',
                } as any,
            ],
        })

        await service.fetchManagedAccount('managed-source-id', 'user-1')

        expect(client.accountsApi.listAccounts).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.stringContaining('nativeIdentity eq "user-1"'),
            })
        )
        expect(service.managedAccountsById.size).toBe(1)
        expect(service.managedAccountsById.get('managed-source-id::user-1')).toBeDefined()
        expect(service.managedAccountsByIdentityId.get('id-1')?.has('managed-source-id::user-1')).toBe(true)
    })

    it('leaves inventory empty when listAccounts returns no rows (e.g. accountFilter mismatch)', async () => {
        const { service, client } = createService({ accountFilter: 'nativeIdentity sw "ad_"' })
        client.accountsApi.listAccounts.mockResolvedValue({ data: [] })

        await service.fetchManagedAccount('managed-source-id', 'bob')

        expect(service.managedAccountsById.size).toBe(0)
    })

    it('leaves inventory empty when JMESPath filter discards the candidate', async () => {
        const { service, client } = createService({
            accountJmespathFilter: 'accounts[?attributes.department == `Engineering`]',
        })
        client.accountsApi.listAccounts.mockResolvedValue({
            data: [
                {
                    id: 'a1',
                    sourceId: 'managed-source-id',
                    nativeIdentity: 'fin-1',
                    sourceName: 'HR Source',
                    attributes: { department: 'Finance' },
                } as any,
            ],
        })

        await service.fetchManagedAccount('managed-source-id', 'fin-1')

        expect(service.managedAccountsById.size).toBe(0)
    })
})

describe('SourceService source lookup boundaries', () => {
    it('returns undefined for missing or blank source names via safe lookup', () => {
        const { service } = createService()

        expect(service.getSourceByNameSafe(undefined)).toBeUndefined()
        expect(service.getSourceByNameSafe(null)).toBeUndefined()
        expect(service.getSourceByNameSafe('')).toBeUndefined()
        expect(service.getSourceByNameSafe('   ')).toBeUndefined()
    })
})

describe('SourceService account pagination sorter stability', () => {
    it('uses sorters=id for paginated fetch by source id', async () => {
        const { service, client } = createService()
        client.paginate.mockResolvedValue([])

        await service.fetchAccountsBySourceId('managed-source-id')

        expect(client.paginate).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ sorters: 'id' }),
            expect.anything(),
            expect.any(String)
        )
    })

    it('uses sorters=id for generator-based fetch by source id', async () => {
        const { service, client } = createService()
        client.paginateParallel.mockImplementation(async function* () {
            yield []
        })

        for await (const _batch of service.fetchAccountsBySourceIdGenerator('managed-source-id')) {
            // consume generator
        }

        expect(client.paginateParallel).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ sorters: 'id' }),
            expect.anything(),
            expect.any(String),
            undefined,
            undefined
        )
    })
})

describe('SourceService reverse correlation setup hardening', () => {
    it('attempts one repair pass and succeeds when consistency is restored', async () => {
        const { service } = createService({
            correlationMode: 'reverse',
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        })

        ;(service as any)._fusionSourceId = 'fusion-source-id'
        ;(service as any).sourcesByName.set('Fusion Source', {
            id: 'fusion-source-id',
            name: 'Fusion Source',
            isManaged: false,
            sourceType: SourceType.Authoritative,
            config: undefined,
        })
        ;(service as any).sourcesByName.set('HR Source', {
            id: 'managed-source-id',
            name: 'HR Source',
            isManaged: true,
            sourceType: SourceType.Authoritative,
            config: {
                name: 'HR Source',
                correlationMode: 'reverse',
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            },
        })

        vi.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
        const phasesSpy = vi.spyOn(service as any, 'ensureReverseCorrelationSetupPhases').mockResolvedValue(undefined)
        const statusSpy = vi.spyOn(service as any, 'getReverseCorrelationSetupStatus')
        statusSpy
            .mockResolvedValueOnce({
                isConsistent: false,
                missingArtifacts: ['identity_attribute'],
            })
            .mockResolvedValueOnce({
                isConsistent: true,
                missingArtifacts: [],
            })
        const repairSpy = vi.spyOn(service as any, 'repairReverseCorrelationSetup').mockResolvedValue(undefined)

        await service.ensureReverseCorrelationSetup(
            {
                name: 'HR Source',
                correlationMode: 'reverse',
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            } as any,
            new Set()
        )

        expect(phasesSpy).toHaveBeenCalledTimes(1)
        expect(repairSpy).toHaveBeenCalledTimes(1)
        expect(statusSpy).toHaveBeenCalledTimes(2)
    })

    it('throws when setup remains inconsistent after one repair pass', async () => {
        const { service } = createService({
            correlationMode: 'reverse',
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        })

        ;(service as any).sourcesByName.set('HR Source', {
            id: 'managed-source-id',
            name: 'HR Source',
            isManaged: true,
            sourceType: SourceType.Authoritative,
            config: {
                name: 'HR Source',
                correlationMode: 'reverse',
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            },
        })
        vi.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
        vi.spyOn(service as any, 'ensureReverseCorrelationSetupPhases').mockResolvedValue(undefined)
        vi.spyOn(service as any, 'repairReverseCorrelationSetup').mockResolvedValue(undefined)
        vi.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
            isConsistent: false,
            missingArtifacts: ['identity_profile_mapping'],
        })

        await expect(
            service.ensureReverseCorrelationSetup(
                {
                    name: 'HR Source',
                    correlationMode: 'reverse',
                    correlationAttribute: 'reverseNativeIdentity',
                    correlationDisplayName: 'Reverse Native Identity',
                } as any,
                new Set()
            )
        ).rejects.toThrow('Reverse correlation setup is inconsistent')
    })

    it.each(['record', 'orphan'] as const)(
        'runs minimal reverse correlation phases for sourceType=%s (identity attribute + managed correlation only)',
        async (sourceType) => {
            const { service } = createService({
                correlationMode: 'reverse',
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
                sourceType,
            })

            ;(service as any)._fusionSourceId = 'fusion-source-id'
            ;(service as any).sourcesByName.set('Fusion Source', {
                id: 'fusion-source-id',
                name: 'Fusion Source',
                isManaged: false,
                sourceType: SourceType.Authoritative,
                config: undefined,
            })
            const hrConfig = {
                name: 'HR Source',
                sourceType,
                correlationMode: 'reverse' as const,
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            }
            ;(service as any).sourcesByName.set('HR Source', {
                id: 'managed-source-id',
                name: 'HR Source',
                isManaged: true,
                sourceType,
                config: hrConfig,
            })

            vi.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
            const fusionSpy = vi.spyOn(service as any, 'ensureFusionSchemaAttribute').mockResolvedValue(undefined)
            const identitySpy = vi.spyOn(service as any, 'ensureIdentityAttribute').mockResolvedValue(undefined)
            const profileSpy = vi.spyOn(service as any, 'ensureIdentityProfileMapping').mockResolvedValue(undefined)
            const managedSpy = vi.spyOn(service as any, 'ensureManagedSourceCorrelation').mockResolvedValue(undefined)
            vi.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
                isConsistent: true,
                missingArtifacts: [],
            })

            await service.ensureReverseCorrelationSetup(hrConfig as any, new Set())

            expect(fusionSpy).not.toHaveBeenCalled()
            expect(profileSpy).not.toHaveBeenCalled()
            expect(identitySpy).toHaveBeenCalledWith('reverseNativeIdentity', 'Reverse Native Identity')
            expect(managedSpy).toHaveBeenCalledWith('reverseNativeIdentity', 'managed-source-id')
        }
    )
})

describe('SourceService authoritative reverse correlation identity profile mapping', () => {
    it('does not PATCH identity profile when a transform for the correlation attribute already exists', async () => {
        const { service, client } = createService({
            correlationMode: 'reverse',
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        })
        const fusionSource: SourceInfo = {
            id: 'fusion-source-id',
            name: 'Fusion Source',
            isManaged: false,
            sourceType: SourceType.Authoritative,
            config: undefined,
        }
        const managedSource = (service as any).sourcesByName.get('HR Source')
        ;(service as any)._fusionSourceId = 'fusion-source-id'
        ;(service as any).sourcesById = new Map([
            [fusionSource.id, fusionSource],
            [managedSource.id, managedSource],
        ])

        client.identityProfilesApi = {
            updateIdentityProfile: vi.fn().mockResolvedValue({ data: { id: 'profile-1' } }),
        }
        client.paginate = vi.fn().mockResolvedValue([
            {
                id: 'profile-1',
                authoritativeSource: { id: 'fusion-source-id' },
                identityAttributeConfig: {
                    attributeTransforms: [
                        {
                            identityAttributeName: 'reverseNativeIdentity',
                            transformDefinition: {
                                type: 'rule',
                                attributes: { name: 'CustomRule' },
                            },
                        },
                    ],
                },
            },
        ])

        await (service as any).ensureIdentityProfileMapping('reverseNativeIdentity', {
            name: 'HR Source',
            sourceType: SourceType.Authoritative,
        } as any)

        expect(client.identityProfilesApi.updateIdentityProfile).not.toHaveBeenCalled()
    })

    it('adds default accountAttribute mapping when profile has no transform for that identity attribute', async () => {
        const { service, client } = createService({
            correlationMode: 'reverse',
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        })
        const fusionSource: SourceInfo = {
            id: 'fusion-source-id',
            name: 'Fusion Source',
            isManaged: false,
            sourceType: SourceType.Authoritative,
            config: undefined,
        }
        const managedSource = (service as any).sourcesByName.get('HR Source')
        ;(service as any)._fusionSourceId = 'fusion-source-id'
        ;(service as any).sourcesById = new Map([
            [fusionSource.id, fusionSource],
            [managedSource.id, managedSource],
        ])

        client.identityProfilesApi = {
            updateIdentityProfile: vi.fn().mockResolvedValue({ data: { id: 'profile-1' } }),
        }
        client.paginate = vi.fn().mockResolvedValue([
            {
                id: 'profile-1',
                authoritativeSource: { id: 'fusion-source-id' },
                identityAttributeConfig: { attributeTransforms: [] },
            },
        ])
        vi.spyOn(service as any, 'waitForIdentityProfileMapping').mockResolvedValue(true)

        await (service as any).ensureIdentityProfileMapping('reverseNativeIdentity', {
            name: 'HR Source',
            sourceType: SourceType.Authoritative,
        } as any)

        expect(client.identityProfilesApi.updateIdentityProfile).toHaveBeenCalledTimes(1)
    })
})

describe('SourceService reverse correlation readiness cache', () => {
    it('assertReverseCorrelationReady calls getReverseCorrelationSetupStatus only once per source until cleared', async () => {
        const { service } = createService({
            correlationMode: 'reverse',
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        })
        const statusSpy = vi.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
            isConsistent: true,
            missingArtifacts: [],
        })
        const sourceConfig = {
            name: 'HR Source',
            correlationMode: 'reverse' as const,
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        }
        await service.assertReverseCorrelationReady(sourceConfig as any)
        await service.assertReverseCorrelationReady(sourceConfig as any)
        expect(statusSpy).toHaveBeenCalledTimes(1)

        service.clearReverseCorrelationReadinessCache()
        await service.assertReverseCorrelationReady(sourceConfig as any)
        expect(statusSpy).toHaveBeenCalledTimes(2)
    })

    it('ensureReverseCorrelationSetup seeds cache so assertReverseCorrelationReady skips status checks', async () => {
        const { service } = createService({
            correlationMode: 'reverse',
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        })
        vi.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
        vi.spyOn(service as any, 'ensureReverseCorrelationSetupPhases').mockResolvedValue(undefined)
        const statusSpy = vi.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
            isConsistent: true,
            missingArtifacts: [],
        })

        await service.ensureReverseCorrelationSetup(
            {
                name: 'HR Source',
                correlationMode: 'reverse',
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            } as any,
            new Set()
        )

        statusSpy.mockClear()
        await service.assertReverseCorrelationReady({
            name: 'HR Source',
            correlationMode: 'reverse',
            correlationAttribute: 'reverseNativeIdentity',
            correlationDisplayName: 'Reverse Native Identity',
        } as any)

        expect(statusSpy).not.toHaveBeenCalled()
    })
})

describe('SourceService identity attribute create error mapping', () => {
    it('maps searchable-limit API errors to actionable guidance', () => {
        const error = {
            response: {
                data: {
                    detailCode: '400.1 Bad request content',
                    messages: [{ text: '"searchable" count exceeded max limit of 15 for "identity attributes".' }],
                },
            },
        }
        const message = buildIdentityAttributeCreateErrorMessage('blackmesa-id', error)
        expect(message).toContain('ISC tenant limit reached for searchable identity attributes')
        expect(message).toContain('blackmesa-id')
    })
})


describe('ensureIdentityAttribute', () => {
    const setupIdentityAttributesApi = (overrides: {
        existing?: { searchable: boolean }
        updated?: any
        created?: any
        conflict?: boolean
    } = {}) => {
        const getIdentityAttribute = vi.fn().mockResolvedValue({ data: overrides.existing ?? null })
        const putIdentityAttribute = vi.fn().mockResolvedValue({ data: overrides.updated ?? { name: 'attr' } })
        const createIdentityAttribute = vi.fn().mockImplementation(async (payload: any) => {
            if (overrides.conflict) {
                const error: any = new Error('already exists')
                error.response = { data: { detailMessage: 'already exists' } }
                throw error
            }
            return { data: overrides.created ?? { name: payload.identityAttributeV2025.name } }
        })

        return { getIdentityAttribute, putIdentityAttribute, createIdentityAttribute }
    }

    const createServiceWithIdentityApi = (api: ReturnType<typeof setupIdentityAttributesApi>) => {
        const { service } = createService()
        ;(service as any).client.identityAttributesApi = api
        return service
    }

    const expectedPayload = {
        name: 'customAttr',
        displayName: 'Custom Attribute',
        searchable: true,
        type: 'string',
        multi: false,
        standard: false,
        system: false,
    }

    it('updates an existing non-searchable attribute with the searchable payload', async () => {
        const api = setupIdentityAttributesApi({ existing: { searchable: false } })
        const service = createServiceWithIdentityApi(api)

        await (service as any).ensureIdentityAttribute('customAttr', 'Custom Attribute')

        expect(api.putIdentityAttribute).toHaveBeenCalledWith({
            name: 'customAttr',
            identityAttributeV2025: expectedPayload,
        })
    })

    it('creates a new searchable attribute with the same payload', async () => {
        const api = setupIdentityAttributesApi()
        const service = createServiceWithIdentityApi(api)

        await (service as any).ensureIdentityAttribute('customAttr', 'Custom Attribute')

        expect(api.createIdentityAttribute).toHaveBeenCalledWith({
            identityAttributeV2025: expectedPayload,
        })
    })

    it('retries as update with the same payload when create reports a conflict', async () => {
        const api = setupIdentityAttributesApi({ conflict: true })
        const service = createServiceWithIdentityApi(api)

        await (service as any).ensureIdentityAttribute('customAttr', 'Custom Attribute')

        expect(api.putIdentityAttribute).toHaveBeenCalledWith({
            name: 'customAttr',
            identityAttributeV2025: expectedPayload,
        })
    })
})
