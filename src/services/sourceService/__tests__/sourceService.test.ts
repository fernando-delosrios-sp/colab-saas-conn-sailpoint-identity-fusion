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
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }
    const client: any = {
        execute: async (fn: () => Promise<any>) => fn(),
        paginate: jest.fn(),
        paginateParallel: jest.fn(),
        accountsApi: {
            listAccounts: jest.fn(),
        },
        sourcesApi: {
            importAccounts: jest.fn(),
        },
        taskManagementApi: {
            getTaskStatus: jest.fn(),
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

    return { service, client, sourceInfo }
}

describe('SourceService Accounts JMESPath filter', () => {
    it('filters managed accounts page-wise during fetchManagedAccounts', async () => {
        const { service, sourceInfo } = createService({
            accountJmespathFilter: 'accounts[?attributes.department == `Engineering`]',
        })

        jest.spyOn(service, 'fetchAccountsBySourceIdGenerator').mockImplementation(async function* () {
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
    it('uses per-source retries and wait for before aggregation polling', async () => {
        const { service, client } = createService({
            aggregationMode: 'before',
            taskResultRetries: 2,
            taskResultWait: 0,
        })

        client.sourcesApi.importAccounts.mockResolvedValue({
            data: { task: { id: 'task-1' } },
        })
        client.taskManagementApi.getTaskStatus.mockResolvedValue({
            data: { completed: false, completionStatus: 'IN_PROGRESS' },
        })

        await (service as any).aggregateManagedSource('managed-source-id', false, true)

        expect(client.taskManagementApi.getTaskStatus).toHaveBeenCalledTimes(1)
        expect((service as any).log.warn).toHaveBeenCalledWith(expect.stringContaining('pollWaitMs=0'))
        expect((service as any).log.warn).toHaveBeenCalledWith(expect.stringContaining('maxPolls=1'))
    })
})

describe('SourceService fetchManagedAccount source scoping', () => {
    it('ignores account IDs that resolve to non-configured managed sources', async () => {
        const { service } = createService()
        jest.spyOn(service as any, 'fetchAccountById').mockResolvedValue({
            id: 'acct-1',
            sourceName: 'Some Other Source',
        } as any)

        await service.fetchManagedAccount('acct-1')

        expect(service.managedAccountsById.size).toBe(0)
        expect(service.managedAccountsAllById.size).toBe(0)
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

        jest.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
        const phasesSpy = jest
            .spyOn(service as any, 'ensureReverseCorrelationSetupPhases')
            .mockResolvedValue(undefined)
        const statusSpy = jest.spyOn(service as any, 'getReverseCorrelationSetupStatus')
        statusSpy
            .mockResolvedValueOnce({
                isConsistent: false,
                missingArtifacts: ['identity_attribute'],
            })
            .mockResolvedValueOnce({
                isConsistent: true,
                missingArtifacts: [],
            })
        const repairSpy = jest.spyOn(service as any, 'repairReverseCorrelationSetup').mockResolvedValue(undefined)

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
        jest.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
        jest.spyOn(service as any, 'ensureReverseCorrelationSetupPhases').mockResolvedValue(undefined)
        jest.spyOn(service as any, 'repairReverseCorrelationSetup').mockResolvedValue(undefined)
        jest.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
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

            jest.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
            const fusionSpy = jest.spyOn(service as any, 'ensureFusionSchemaAttribute').mockResolvedValue(undefined)
            const identitySpy = jest.spyOn(service as any, 'ensureIdentityAttribute').mockResolvedValue(undefined)
            const profileSpy = jest.spyOn(service as any, 'ensureIdentityProfileMapping').mockResolvedValue(undefined)
            const managedSpy = jest.spyOn(service as any, 'ensureManagedSourceCorrelation').mockResolvedValue(undefined)
            jest.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
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
            updateIdentityProfile: jest.fn().mockResolvedValue({ data: { id: 'profile-1' } }),
        }
        client.paginate = jest.fn().mockResolvedValue([
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
            updateIdentityProfile: jest.fn().mockResolvedValue({ data: { id: 'profile-1' } }),
        }
        client.paginate = jest.fn().mockResolvedValue([
            {
                id: 'profile-1',
                authoritativeSource: { id: 'fusion-source-id' },
                identityAttributeConfig: { attributeTransforms: [] },
            },
        ])
        jest.spyOn(service as any, 'waitForIdentityProfileMapping').mockResolvedValue(true)

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
        const statusSpy = jest.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
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
        jest.spyOn(service, 'validateNoAttributeOverlap').mockImplementation(() => {})
        jest.spyOn(service as any, 'ensureReverseCorrelationSetupPhases').mockResolvedValue(undefined)
        const statusSpy = jest.spyOn(service as any, 'getReverseCorrelationSetupStatus').mockResolvedValue({
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
