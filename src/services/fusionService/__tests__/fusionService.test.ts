import type { Mocked } from 'vitest'
import { FusionService } from '../fusionService'
import { AggregationTracker } from '../aggregationTracker'
import { MatchOutcomeDispatcher } from '../../matchingService/matchOutcomeDispatcher'
import { LogService } from '../../logService'
import { IdentityService } from '../../identityService'
import { SourceService } from '../../sourceService'
import { FormService } from '../../formService'
import { MappingService } from '../../mappingService'
import { DefinitionService } from '../../definitionService'
import { MatchingService } from '../../matchingService'
import { SchemaService } from '../../schemaService'
import { ServiceRegistry } from '../../serviceRegistry'
import { FusionConfig } from '../../../model/config'
import { FusionRun, toManagedAccountInfo } from '../../../model/fusionRun'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from '../../../model/account'
import { StatusEntitlement } from '../../../model/statusEntitlement'
import { hasValue, trimStr } from '../../../utils/safeRead'

// Mock dependencies
vi.mock('../../logService')
vi.mock('../../identityService')
vi.mock('../../sourceService')
vi.mock('../../formService')
vi.mock('../../mappingService')
vi.mock('../../definitionService')
vi.mock('../../matchingService')
vi.mock('../../schemaService')


function seedRunInventory(run: FusionRun, accounts: Map<string, Account>): void {
    run.managedAccountInventory.clear()
    for (const [key, account] of accounts.entries()) {
        run.managedAccountInventory.set(key, toManagedAccountInfo(account))
    }
}

describe('FusionService', () => {
    const FUSION_SOURCE_ID = 'fusion-src'

    let fusionService: FusionService
    let run: FusionRun
    let mockLog: Mocked<LogService>
    let mockIdentities: Mocked<IdentityService>
    let mockSources: Mocked<SourceService>
    let mockForms: Mocked<FormService>
    let mockMappingService: Mocked<MappingService>
    let mockDefinitionService: Mocked<DefinitionService>
    let mockMatchingService: Mocked<MatchingService>
    let mockSchemas: Mocked<SchemaService>
    let mockConfig: FusionConfig

    function createDispatcherFor(fusionService: FusionService): MatchOutcomeDispatcher {
        return new MatchOutcomeDispatcher({
            config: fusionService.config,
            log: fusionService.log,
            run: fusionService.run,
            matchingService: fusionService.matchingService,
            correlationManager: fusionService.correlationManager,
            definitionService: mockDefinitionService,
            mappingService: mockMappingService,
            accountAssembly: fusionService.accountAssembly,
            forms: fusionService.forms,
            decisionProcessor: fusionService.decisionProcessor,
            commandType: fusionService.commandType,
            isPersistentRun: () => fusionService.isPersistentRun(),
        })
    }

    beforeEach(() => {
        run = new FusionRun()

        // Mock config with Type assertion
        mockConfig = {
            resetAccounts: false,
            resetForms: false,
            fusionOwnerIsGlobalReviewer: false,
            fusionReportOnAggregation: false,
            fusionFormAttributes: ['email', 'firstName', 'lastName'],
            baseurl: 'https://example.identitynow.com',
            k8sCluster: false,
            managedAccountsBatchSize: 50,
            deleteEmpty: false,
            sources: [],
        } as unknown as FusionConfig

        // Reset mocks
        mockLog = new LogService({ spConnDebugLoggingEnabled: false }) as Mocked<LogService>
        run.log = mockLog
        const mockClient = {} as any
        mockSources = new SourceService(mockConfig, mockLog, mockClient, run) as Mocked<SourceService>
        ;(mockSources as any)._fusionSourceId = FUSION_SOURCE_ID
        Object.defineProperty(mockSources, 'fusionSourceId', {
            get: vi.fn(() => FUSION_SOURCE_ID),
            configurable: true,
        })
        mockIdentities = new IdentityService(
            mockConfig,
            mockLog,
            mockClient,
            mockSources,
            run
        ) as Mocked<IdentityService>
        mockForms = new FormService(
            mockConfig,
            mockLog,
            mockClient,
            mockSources,
            mockIdentities,
            undefined,
            run
        ) as Mocked<FormService>
        const mockLocks = {} as any
        mockSchemas = new SchemaService(mockConfig, mockLog, mockSources, mockClient) as Mocked<SchemaService>
        mockMappingService = new MappingService(
            mockConfig,
            mockLog
        ) as Mocked<MappingService>
        mockDefinitionService = new DefinitionService(
            mockConfig,
            mockSchemas,
            mockLog,
            mockLocks
        ) as Mocked<DefinitionService>
        mockMatchingService = new MatchingService(
            mockConfig,
            mockLog
        ) as Mocked<MatchingService>

        // Mock specific properties/methods needed for initialization
        Object.defineProperty(mockSources, 'managedAccountsById', {
            get: vi.fn(() => new Map()),
            configurable: true,
        })
        Object.defineProperty(mockSources, 'managedAccountsByIdentityId', {
            get: vi.fn(() => new Map()),
            configurable: true,
        })

        // Redirect run.managedAccountsById/ByIdentityId to mockSources getters
        // so that test spies on mockSources flow through to production code accessing run directly.
        Object.defineProperty(run, 'managedAccountsById', {
            get: () => mockSources.managedAccountsById,
            configurable: true,
        })
        Object.defineProperty(run, 'managedAccountsByIdentityId', {
            get: () => mockSources.managedAccountsByIdentityId,
            configurable: true,
        })

        Object.defineProperty(mockSources, 'fusionAccounts', {
            get: vi.fn(() => []),
            configurable: true,
        })
        Object.defineProperty(mockSources, 'managedSources', {
            get: vi.fn(() => []),
            configurable: true,
        })
        Object.defineProperty(mockIdentities, 'identities', {
            get: vi.fn(() => []),
            configurable: true,
        })
        Object.defineProperty(mockSchemas, 'fusionDisplayAttribute', {
            get: vi.fn(() => 'displayName'),
            configurable: true,
        })

        mockSources.resolveIscAccountIdForManagedKey = vi.fn((managedKey: string) => {
            const work = mockSources.managedAccountsById as unknown as Map<string, Account> | undefined
            const acc =
                (work instanceof Map ? work.get(managedKey) : undefined) ??
                (run.getManagedAccountInfo(managedKey)
                    ? { id: run.getManagedAccountInfo(managedKey)!.id }
                    : undefined)
            const raw = acc?.id
            if (hasValue(raw)) return trimStr(raw) ?? ''
            // Tests without composite map entries: treat non-composite keys as ISC account ids
            if (!managedKey.includes('::')) return managedKey
            return undefined
        })

        fusionService = new FusionService(
            mockConfig,
            mockLog,
            mockIdentities,
            mockSources,
            mockForms,
            mockMappingService,
            mockDefinitionService,
            mockMatchingService,
            mockSchemas,
            run,
            StandardCommand.StdAccountList
        )
        fusionService.matchOutcomeDispatcher = createDispatcherFor(fusionService)
        fusionService.setTracker(new AggregationTracker())

        // Mock ServiceRegistry
        vi.spyOn(ServiceRegistry, 'getCurrent').mockReturnValue({
            fusion: fusionService,
            sources: mockSources,
            identities: mockIdentities,
            schemas: mockSchemas,
            forms: mockForms,
            mapping: mockMappingService,
            definition: mockDefinitionService,
            matching: mockMatchingService,
            log: mockLog,
        } as unknown as ServiceRegistry)
    })

    describe('initialization', () => {
        it('should initialize with provided config', () => {
            expect(fusionService).toBeDefined()
            expect(fusionService.isResetAccounts()).toBe(false)
            expect(fusionService.isResetForms()).toBe(false)
        })
    })

    describe('reset flags', () => {
        beforeEach(() => {
            mockSources.patchSourceConfig = vi.fn().mockResolvedValue(undefined)
        })

        it('reflects resetAccounts and resetForms from config at construction', () => {
            const service = new FusionService(
                { ...mockConfig, resetAccounts: true, resetForms: false } as FusionConfig,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockMappingService,
                mockDefinitionService,
                mockMatchingService,
                mockSchemas,
                run,
                StandardCommand.StdAccountList
            )

            expect(service.isResetAccounts()).toBe(true)
            expect(service.isResetForms()).toBe(false)
        })

        it('disableResetAccounts patches resetAccounts and legacy reset', async () => {
            await fusionService.disableResetAccounts()

            expect(mockSources.patchSourceConfig).toHaveBeenCalledTimes(2)
            expect(mockSources.patchSourceConfig).toHaveBeenCalledWith(
                FUSION_SOURCE_ID,
                '/connectorAttributes/resetAccounts',
                false,
                'FusionService>disableResetAccounts'
            )
            expect(mockSources.patchSourceConfig).toHaveBeenCalledWith(
                FUSION_SOURCE_ID,
                '/connectorAttributes/reset',
                false,
                'FusionService>disableResetAccounts>legacyReset'
            )
        })

        it('disableResetForms patches resetForms only', async () => {
            await fusionService.disableResetForms()

            expect(mockSources.patchSourceConfig).toHaveBeenCalledTimes(1)
            expect(mockSources.patchSourceConfig).toHaveBeenCalledWith(
                FUSION_SOURCE_ID,
                '/connectorAttributes/resetForms',
                false,
                'FusionService>disableResetForms'
            )
        })
    })

    describe('getISCAccount', () => {
        it('emits identity and uuid alongside key for platform object input validation', async () => {
            const key = { simple: { id: 'NG000025' } }
            const fusionAccount = FusionAccount.fromIdentity({ id: 'NG000025', name: 'Ada Wong' } as IdentityDocument)

            mockDefinitionService.getSimpleKey.mockReturnValue(key)
            mockSchemas.getFusionAttributeSubset.mockReturnValue({ id: 'NG000025', name: 'Ada Wong' })
            mockSchemas.listSchemaAttributeNames.mockReturnValue(['id', 'name', 'actions', 'statuses'])

            const output = await fusionService.getISCAccount(fusionAccount)

            expect(output).toMatchObject({
                key,
            })
        })

        it('does not populate reviews for candidate-only identities', async () => {
            const identityId = 'candidate-only-1'
            const reviewUrl = 'https://example.identitynow.com/forms/review/abc'
            const key = { simple: { id: identityId } }
            const fusionAccount = FusionAccount.fromIdentity({
                id: identityId,
                name: 'Candidate Only',
            } as IdentityDocument)

            mockDefinitionService.getSimpleKey.mockReturnValue(key)
            mockSchemas.getFusionAttributeSubset.mockImplementation((attrs) => ({ ...attrs }))
            mockSchemas.listSchemaAttributeNames.mockReturnValue(['id', 'name', 'actions', 'statuses', 'reviews'])

            ;(run as any)._pendingCandidateIdentityIds = new Set([identityId])
            ;(run as any)._pendingReviewUrlsByCandidateId = new Map([[identityId, [reviewUrl]]])
            ;(run as any)._pendingReviewUrlsByReviewerId = new Map()

            const output = await fusionService.getISCAccount(fusionAccount)

            expect(output?.attributes?.statuses).toContain('candidate')
            expect(output?.attributes?.statuses).not.toContain('activeReviews')
            expect(output?.attributes?.reviews).toEqual([])
        })

        it('populates reviews for reviewer identities with pending forms', async () => {
            const identityId = 'reviewer-1'
            const reviewUrl = 'https://example.identitynow.com/forms/review/reviewer'
            const key = { simple: { id: identityId } }
            const fusionAccount = FusionAccount.fromIdentity({
                id: identityId,
                name: 'Reviewer User',
            } as IdentityDocument)
            fusionAccount.setSourceReviewer('src-1')

            mockDefinitionService.getSimpleKey.mockReturnValue(key)
            mockSchemas.getFusionAttributeSubset.mockImplementation((attrs) => ({ ...attrs }))
            mockSchemas.listSchemaAttributeNames.mockReturnValue(['id', 'name', 'actions', 'statuses', 'reviews'])

            ;(run as any)._pendingCandidateIdentityIds = new Set()
            ;(run as any)._pendingReviewUrlsByCandidateId = new Map()
            ;(run as any)._pendingReviewUrlsByReviewerId = new Map([[identityId, [reviewUrl]]])

            const output = await fusionService.getISCAccount(fusionAccount)

            expect(output?.attributes?.statuses).toContain('reviewer')
            expect(output?.attributes?.statuses).toContain('activeReviews')
            expect(output?.attributes?.reviews).toEqual([reviewUrl])
        })
    })

    describe('processFusionAccounts', () => {
        it('should process existing fusion accounts', async () => {
            const mockAccount = {
                nativeIdentity: 'fusion-1',
                attributes: {
                    id: 'fusion-1',
                    name: 'Existing Fusion Account',
                },
            } as unknown as Account

            vi.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockAccount])

            // Mock FusionAccount.fromFusionAccount static method if possible,
            // but since it's a class method we might depend on its implementation or mock the return of processFusionAccount
            // For unit testing FusionService, we want to see if it calls processFusionAccount.

            // Since processFusionAccounts calls processFusionAccount internally, let's spy on that if we can,
            // or verify side effects.

            const result = await fusionService.processFusionAccounts()

            expect(result).toHaveLength(1)
            expect(result[0].managedKey).toBe(`fusion-1`)
        })

        it('removes the correlated identity from the identity work queue after processing', async () => {
            const identityId = 'identity-claimed-1'
            const mockAccount = {
                nativeIdentity: 'fusion-claimed-1',
                sourceId: 'mock-source',
                identityId,
                attributes: {
                    id: 'fusion-claimed-1',
                    name: 'Claimed Fusion Account',
                    statuses: [],
                    accounts: [],
                },
            } as unknown as Account

            vi.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockAccount])
            mockIdentities.getIdentityById.mockReturnValue(undefined)
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            // deleteIdentity must exist on the mock (it's a new method)
            mockIdentities.deleteIdentity = vi.fn()

            await fusionService.processFusionAccounts()

            expect(mockIdentities.deleteIdentity).toHaveBeenCalledWith(identityId)
        })

        it('does not call deleteIdentity for uncorrelated fusion accounts (no identityId)', async () => {
            const mockAccount = {
                nativeIdentity: 'fusion-uncorrelated-1',
                sourceId: 'mock-source',
                identityId: undefined,
                attributes: {
                    id: 'fusion-uncorrelated-1',
                    name: 'Uncorrelated Fusion Account',
                    statuses: [],
                    accounts: [],
                },
            } as unknown as Account

            vi.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockAccount])
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            mockIdentities.deleteIdentity = vi.fn()

            await fusionService.processFusionAccounts()

            expect(mockIdentities.deleteIdentity).not.toHaveBeenCalled()
        })

        it('ensures processIdentities skips an identity after processFusionAccounts claims it', async () => {
            const identityId = 'identity-dedup-1'
            const mockFusionAccount = {
                nativeIdentity: 'fusion-dedup-1',
                sourceId: 'mock-source',
                identityId,
                attributes: {
                    id: 'fusion-dedup-1',
                    name: 'Dedup Fusion Account',
                    statuses: [],
                    accounts: [],
                },
            } as unknown as Account

            const mockIdentityDoc = { id: identityId, name: 'Dedup Identity' } as IdentityDocument

            vi.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockFusionAccount])
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            // deleteIdentity removes identity from the service cache; simulate this by tracking calls
            const deletedIds = new Set<string>()
            mockIdentities.deleteIdentity = vi.fn((id: string) => {
                deletedIds.add(id)
            })

            // identities getter returns only those not yet deleted
            const allIdentities = [mockIdentityDoc]
            vi.spyOn(mockIdentities, 'identities', 'get').mockImplementation(() =>
                allIdentities.filter((i) => !deletedIds.has(i.id))
            )
            mockIdentities.getIdentityById.mockReturnValue(undefined)

            await fusionService.processFusionAccounts()

            // After processFusionAccounts the identity should be removed
            expect(deletedIds.has(identityId)).toBe(true)

            // processIdentities will see an empty list — no new fusion account created
            const result = await fusionService.processIdentities()
            expect(result).toHaveLength(0)
        })

        it('does not append Associated managed account when fusion assignment decision replays authorization', async () => {
            const managedKey = 'source-a-id::native-new-2'
            const historicalAccount = {
                nativeIdentity: 'fusion-identity-1',
                identityId: 'identity-1',
                name: 'Fusion Identity',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {
                    accounts: ['source-a-id::native-existing-1'],
                },
            } as unknown as Account

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
                new Map([
                    [
                        managedKey,
                        {
                            id: 'acct-new-2',
                            name: 'Managed Account New',
                            nativeIdentity: 'native-new-2',
                            sourceId: 'source-a-id',
                            sourceName: 'Source A',
                            identityId: 'identity-1',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(
                new Map([['identity-1', new Set([managedKey])]])
            )
            seedRunInventory(run, new Map([
                    [
                        managedKey,
                        {
                            id: 'acct-new-2',
                            name: 'Managed Account New',
                            nativeIdentity: 'native-new-2',
                            sourceId: 'source-a-id',
                            sourceName: 'Source A',
                            identityId: 'identity-1',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            vi.spyOn(mockForms, 'getFusionAssignmentDecision').mockReturnValue({
                submitter: { id: 'reviewer-1', email: 'r@example.com', name: 'fernando.delosrios' },
                account: {
                    id: managedKey,
                    name: 'Managed Account New',
                    sourceName: 'Source A',
                    sourceId: 'source-a-id',
                    nativeIdentity: 'native-new-2',
                },
                newIdentity: false,
                identityId: 'identity-1',
                comments: 'Link to existing',
                finished: true,
                sourceType: 'authoritative',
            } as any)

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.accountIds).toContain(managedKey)
            expect(result.history.some((h) => h.includes('as authorized by fernando.delosrios'))).toBe(true)
            expect(
                result.history.some((h) => h.includes('Associated managed account Managed Account New [Source A]'))
            ).toBe(false)
        })
    })

    describe('FusionAccount identity reference hydration', () => {
        it('hydrates identity alias from prior fusion account identity reference when Identity document is unavailable', () => {
            const prior = {
                nativeIdentity: 'fusion-identity-1',
                sourceId: 'mock-source',
                name: '',
                identityId: 'identity-1',
                attributes: {
                    id: 'fusion-identity-1',
                    // Simulate legacy/persisted state where attributes.name may be blank or not the true identity name
                    name: '',
                },
                identity: {
                    name: 'Jane Identity (from ref)',
                },
            } as unknown as Account

            const fusionAccount = FusionAccount.fromFusionAccount(prior)

            // name is the source title (account.name) and is empty here; alias chain picks up the identity ref name
            expect(fusionAccount.name).toBeUndefined()
            expect(fusionAccount.displayName).toBeUndefined()
            expect(fusionAccount.identityName).toBe('Jane Identity (from ref)')
            expect(fusionAccount.identityDisplayName).toBe('Jane Identity (from ref)')
            expect((fusionAccount.attributeBag.identity as any)?.name).toBeUndefined()
        })

        it('does not consider a name-only reference an identity linkage', () => {
            const prior = {
                nativeIdentity: 'fusion-identity-no-ref',
                sourceId: 'mock-source',
                name: 'Managed Account Name',
                attributes: {
                    id: 'fusion-identity-no-ref',
                },
                identity: {
                    name: 'Name Only Ref',
                },
            } as unknown as Account

            const fusionAccount = FusionAccount.fromFusionAccount(prior)

            // No identityId was supplied, so IdentityInfo cannot be built: name-only references
            // are not treated as identity linkages.
            expect(fusionAccount.isIdentity).toBe(false)
            expect(fusionAccount.displayName).toBe('Managed Account Name')
            expect(fusionAccount.identityDisplayName).toBeUndefined()
        })

        it('prefers Identity attributes.displayName when identity layer is applied', () => {
            const prior = {
                nativeIdentity: 'fusion-identity-2',
                name: '',
                attributes: {
                    id: 'fusion-identity-2',
                    name: '',
                },
                identity: {
                    name: 'Stale Name (from ref)',
                },
                identityId: 'identity-xyz',
            } as unknown as Account

            const fusionAccount = FusionAccount.fromFusionAccount(prior)

            const identityDoc = {
                id: 'identity-xyz',
                name: 'Authoritative Identity Name',
                attributes: {
                    displayName: 'Authoritative Display Name',
                },
            } as unknown as IdentityDocument

            fusionAccount.addIdentityLayer(identityDoc)

            // name is the source title (still empty); displayName comes from identity.attributes.displayName
            expect(fusionAccount.name).toBeUndefined()
            expect(fusionAccount.identityName).toBe('Authoritative Identity Name')
            expect(fusionAccount.identityDisplayName).toBe('Authoritative Display Name')
        })
    })

    describe('processIdentities', () => {
        it('should process new identities', async () => {
            const mockIdentity = {
                id: 'identity-1',
                name: 'New Identity',
            } as IdentityDocument

            vi.spyOn(mockIdentities, 'identities', 'get').mockReturnValue([mockIdentity])

            // Mock mapAttributes since it's called in processIdentity
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const result = await fusionService.processIdentities()

            expect(result).toHaveLength(1)
            expect(result[0].identityId).toBe('identity-1')
            // Should be registered in the map
            expect(fusionService.getFusionIdentity('identity-1')).toBeDefined()
        })

        it('marks new identity-origin fusion accounts for unique reset', async () => {
            const mockIdentity = {
                id: 'identity-reset-1',
                name: 'Reset Identity',
            } as IdentityDocument

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const result = await fusionService.processIdentity(mockIdentity)

            expect(result).toBeDefined()
            expect(result?.needsReset).toBe(true)
        })

        it('uses identity display name (not ID-like attributes.name) in history entries', async () => {
            const mockIdentity = {
                id: 'identity-12345',
                name: 'Jane Doe',
                attributes: {
                    name: 'identity-12345',
                },
            } as unknown as IdentityDocument

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const result = await fusionService.processIdentity(mockIdentity)

            expect(result).toBeDefined()
            expect(result?.history).toEqual(
                expect.arrayContaining([expect.stringContaining('Set Jane Doe [Identities] as baseline')])
            )
            expect(result?.history.some((entry) => entry.includes('Set identity-12345 [Identities] as baseline'))).toBe(
                false
            )
        })

        it('sets fusion display attribute from identity name at output time', async () => {
            const mockIdentity = {
                id: 'identity-display-1',
                name: 'Jane Doe',
                attributes: {
                    displayName: 'Jane Q. Doe',
                },
            } as unknown as IdentityDocument

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.applyDisplayAttributeOverride.mockImplementation((account) => {
                account.attributes.displayName = account.identityName ?? null
            })

            const result = await fusionService.processIdentity(mockIdentity)

            expect(result).toBeDefined()
            mockDefinitionService.applyDisplayAttributeOverride(result!)
            expect(result?.attributes.displayName).toBe('Jane Doe')
        })

        it('should skip existing identities', async () => {
            const mockIdentity = {
                id: 'identity-1',
                name: 'New Identity',
            } as IdentityDocument
            vi.spyOn(mockIdentities, 'identities', 'get').mockReturnValue([mockIdentity])

            await fusionService.processIdentity(mockIdentity)
            const result = await fusionService.processIdentity(mockIdentity)

            expect(result).toBeUndefined()
        })
    })

    describe('processManagedAccounts', () => {
        beforeEach(() => {
            mockDefinitionService.refreshReverseCorrelationAttributes.mockImplementation((fusionAccount) => {
                const configs = (mockConfig as any).sources ?? []
                for (const sc of configs) {
                    if (sc.correlationMode === 'reverse' && sc.correlationAttribute) {
                        const missingForSource =
                            typeof fusionAccount.getMissingAccountIdsForSource === 'function'
                                ? fusionAccount.getMissingAccountIdsForSource(sc.name)
                                : []
                        if (missingForSource.length > 0) {
                            const info = fusionAccount.getManagedAccountInfo(missingForSource[0])
                            if (info) {
                                fusionAccount.setReverseCorrelationAttribute(sc.correlationAttribute, info.schema.id)
                            }
                        }
                    }
                }
            })
        })

        it('drops uncorrelated managed accounts that are already linked in Fusion', async () => {
            const linkedAccount = {
                id: 'acct-linked-1',
                nativeIdentity: 'native-linked-1',
                name: 'Linked Account',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                identityId: 'identity-linked',
                attributes: {},
                uncorrelated: true,
            } as Account
            const key = 'source-a-id::native-linked-1'
            const workQueue = new Map([[key, linkedAccount]])
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(
                new Map([['identity-linked', new Set([key])]])
            )
            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: {},
            })

            const existing = FusionAccount.fromManagedAccount(linkedAccount)
            fusionService.setFusionAccount(existing)

            const result = await fusionService.processManagedAccount(linkedAccount)

            expect(result).toBeUndefined()
            expect(workQueue.has(key)).toBe(false)
            expect(mockSources.managedAccountsByIdentityId.has('identity-linked')).toBe(false)
        })

        it('uses current-run non-matched managed source accounts as deferred candidates for subsequent managed accounts', async () => {
            fusionService.config.managedAccountsBatchSize = 1
            const firstAccount = {
                id: 'acct-seq-1',
                nativeIdentity: 'native-seq-1',
                name: 'Taylor Jordan',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account
            const secondAccount = {
                id: 'acct-seq-2',
                nativeIdentity: 'native-seq-2',
                name: 'Taylor Jordan',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            const workQueue = new Map([
                ['source-a-id::native-seq-1', firstAccount],
                ['source-a-id::native-seq-2', secondAccount],
            ])
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            vi.spyOn(mockSources, 'managedSources', 'get').mockReturnValue([])
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            mockMatchingService.scoreFusionAccount.mockImplementation(async (account, candidates, candidateType) => {
                const candidateList = Array.from(candidates)
                if (candidateType !== 'deferred') return candidateList.length
                if (candidateList.length > 0) {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Current operation non-match',
                        candidateType: 'deferred',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 94, isMatch: true } as any],
                    } as any)
                }
                return candidateList.length
            })

            // Pre-register first account in fusionAccountMap so queryForSource can find it as a deferred candidate
            const preFirst = FusionAccount.fromManagedAccount(firstAccount)
            preFirst.setNonMatched()
            ;(fusionService as any).setFusionAccount(preFirst)

            await fusionService.processManagedAccounts()

            expect(fusionService.fusionAccounts).toHaveLength(1)
            expect(workQueue.has('source-a-id::native-seq-2')).toBe(false)
            expect(mockLog.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        })

        it('keeps deferred candidate visibility within a managed-account batch', async () => {
            fusionService.config.managedAccountsBatchSize = 2
            const firstAccount = {
                id: 'acct-batch-def-1',
                nativeIdentity: 'native-batch-def-1',
                name: 'Jordan Taylor',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account
            const secondAccount = {
                id: 'acct-batch-def-2',
                nativeIdentity: 'native-batch-def-2',
                name: 'Jordan Taylor',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            const workQueue = new Map([
                ['source-a-id::native-batch-def-1', firstAccount],
                ['source-a-id::native-batch-def-2', secondAccount],
            ])
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            vi.spyOn(mockSources, 'managedSources', 'get').mockReturnValue([])
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            mockMatchingService.scoreFusionAccount.mockImplementation(async (account, candidates, candidateType) => {
                if (candidateType === 'identity' && account.managedAccountId === 'source-a-id::native-batch-def-1') {
                    await new Promise((resolve) => setTimeout(resolve, 5))
                }
                const candidateList = Array.from(candidates)
                if (candidateType !== 'deferred') return candidateList.length
                if (candidateList.length > 0) {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Current operation non-match',
                        candidateType: 'deferred',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 94, isMatch: true } as any],
                    } as any)
                }
                return candidateList.length
            })

            // Pre-register first account in fusionAccountMap so queryForSource can find it as a deferred candidate
            const preFirst = FusionAccount.fromManagedAccount(firstAccount)
            preFirst.setNonMatched()
            ;(fusionService as any).setFusionAccount(preFirst)

            await fusionService.processManagedAccounts()

            expect(fusionService.fusionAccounts).toHaveLength(1)
            expect(workQueue.has('source-a-id::native-batch-def-2')).toBe(false)
            expect(mockLog.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        })

        it('runs deferred source identity phase in parallel while deferred candidate scoring stays batched', async () => {
            fusionService.config.managedAccountsBatchSize = 2
            const accountA1 = {
                id: 'acct-par-a-1',
                nativeIdentity: 'native-par-a-1',
                name: 'Parallel A1',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account
            const accountA2 = {
                id: 'acct-par-a-2',
                nativeIdentity: 'native-par-a-2',
                name: 'Parallel A2',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account
            const accountB1 = {
                id: 'acct-seq-b-1',
                nativeIdentity: 'native-seq-b-1',
                name: 'Sequential B1',
                sourceId: 'source-b-id',
                sourceName: 'Source B',
                attributes: {},
                uncorrelated: true,
            } as Account
            const accountB2 = {
                id: 'acct-seq-b-2',
                nativeIdentity: 'native-seq-b-2',
                name: 'Sequential B2',
                sourceId: 'source-b-id',
                sourceName: 'Source B',
                attributes: {},
                uncorrelated: true,
            } as Account
            const workQueue = new Map([
                ['source-a-id::native-par-a-1', accountA1],
                ['source-a-id::native-par-a-2', accountA2],
                ['source-b-id::native-seq-b-1', accountB1],
                ['source-b-id::native-seq-b-2', accountB2],
            ])
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            vi.spyOn(mockSources, 'managedSources', 'get').mockReturnValue([])
            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: { deferredMatching: false },
            })
            ;(fusionService as any).run.sourcesByName.set('Source B', {
                id: 'source-b-id',
                name: 'Source B',
                sourceType: 'authoritative',
                config: { deferredMatching: true },
            })
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const identity = FusionAccount.fromIdentity({
                id: 'identity-1',
                name: 'Identity One',
                attributes: {},
            } as any)
            fusionService.setFusionAccount(identity)

            let inFlightIdentityA = 0
            let maxInFlightIdentityA = 0
            let inFlightIdentityB = 0
            let maxInFlightIdentityB = 0
            let inFlightDeferredB = 0
            let maxInFlightDeferredB = 0
            mockMatchingService.scoreFusionAccount.mockImplementation(async (fusionAccount, candidates, candidateType) => {
                const candidateList = Array.from(candidates)
                if (candidateType === 'identity') {
                    if (fusionAccount.sourceName === 'Source A') {
                        inFlightIdentityA += 1
                        maxInFlightIdentityA = Math.max(maxInFlightIdentityA, inFlightIdentityA)
                    } else if (fusionAccount.sourceName === 'Source B') {
                        inFlightIdentityB += 1
                        maxInFlightIdentityB = Math.max(maxInFlightIdentityB, inFlightIdentityB)
                    }
                    await new Promise((resolve) => setTimeout(resolve, 5))
                    if (fusionAccount.sourceName === 'Source A') {
                        inFlightIdentityA -= 1
                    } else if (fusionAccount.sourceName === 'Source B') {
                        inFlightIdentityB -= 1
                    }
                    return candidateList.length
                }
                if (candidateType !== 'deferred') {
                    return candidateList.length
                }
                inFlightDeferredB += 1
                maxInFlightDeferredB = Math.max(maxInFlightDeferredB, inFlightDeferredB)
                await new Promise((resolve) => setTimeout(resolve, 5))
                if (fusionAccount.sourceName === 'Source B' && candidateList.length > 0) {
                    fusionAccount.addFusionMatch({
                        identityId: '',
                        identityName: 'Current operation non-match source B',
                        candidateType: 'deferred',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true } as any],
                    } as any)
                }
                inFlightDeferredB -= 1
                return candidateList.length
            })

            // Pre-register a Source B non-match candidate for deferred candidate visibility
            const preB = FusionAccount.fromManagedAccount({
                id: 'acct-seq-b-0',
                nativeIdentity: 'native-seq-b-0',
                name: 'Sequential B0',
                sourceId: 'source-b-id',
                sourceName: 'Source B',
                attributes: {},
            } as any)
            preB.setNonMatched()
            fusionService.setFusionAccount(preB)

            await fusionService.processManagedAccounts()

            expect(maxInFlightIdentityA).toBeGreaterThan(1)
            expect(maxInFlightIdentityB).toBeGreaterThan(1)
            expect(maxInFlightDeferredB).toBeGreaterThan(1)
            expect(mockLog.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        })

        it('does not include deferred candidates from other sources', async () => {
            const sourceAAccount = FusionAccount.fromManagedAccount({
                id: 'acct-other-source',
                nativeIdentity: 'native-other-source',
                name: 'Source A Candidate',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
            sourceAAccount.setNonMatched()
            fusionService.setFusionAccount(sourceAAccount)
            ;(fusionService as any).run.sourcesByName.set('Source B', {
                id: 'source-b-id',
                name: 'Source B',
                sourceType: 'authoritative',
                config: { deferredMatching: true },
            })
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const sourceBDeferredCandidateSizes: number[] = []
            mockMatchingService.scoreFusionAccount.mockImplementation(async (_account, candidates, candidateType) => {
                const n = Array.from(candidates).length
                if (candidateType === 'deferred') sourceBDeferredCandidateSizes.push(n)
                return n
            })

            await fusionService.processManagedAccount({
                id: 'acct-source-b-target',
                nativeIdentity: 'native-source-b-target',
                name: 'Source B Target',
                sourceId: 'source-b-id',
                sourceName: 'Source B',
                attributes: {},
                uncorrelated: true,
            } as Account)

            expect(sourceBDeferredCandidateSizes).toEqual([0])
        })

        it('resolves all correlated accounts in the correlated account sweep before uncorrelated batch processing', async () => {
            fusionService.config.managedAccountsBatchSize = 2
            const correlatedA = {
                id: 'acct-corr-a',
                nativeIdentity: 'native-corr-a',
                name: 'Correlated A',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                identityId: 'identity-a',
                attributes: {},
                uncorrelated: false,
            } as Account
            const uncorrelated = {
                id: 'acct-unc-1',
                nativeIdentity: 'native-unc-1',
                name: 'Uncorrelated 1',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account
            const correlatedB = {
                id: 'acct-corr-b',
                nativeIdentity: 'native-corr-b',
                name: 'Correlated B',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                identityId: 'identity-b',
                attributes: {},
                uncorrelated: false,
            } as Account

            const workQueue = new Map([
                ['source-a-id::native-corr-a', correlatedA],
                ['source-a-id::native-unc-1', uncorrelated],
                ['source-a-id::native-corr-b', correlatedB],
            ])
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            vi.spyOn(mockSources, 'managedSources', 'get').mockReturnValue([])

            const callOrder: string[] = []
            const originalProcessManagedAccount = fusionService.processManagedAccount.bind(fusionService)
            vi.spyOn(fusionService, 'processManagedAccount').mockImplementation(async (account: Account) => {
                callOrder.push(account.id ?? '')
                return originalProcessManagedAccount(account)
            })

            await fusionService.processManagedAccounts()

            expect(callOrder).toHaveLength(2)
            expect(new Set(callOrder.slice(0, 2))).toEqual(new Set(['acct-corr-a', 'acct-corr-b']))
        })

        it('short-circuits duplicate checks when an identity-origin match already exists', async () => {
            const mockManagedAccount = {
                id: 'acct-short-circuit-1',
                nativeIdentity: 'native-short-circuit-1',
                name: 'Managed Account 1',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account
            const existingIdentity = FusionAccount.fromIdentity({
                id: 'identity-1',
                name: 'Identity One',
                attributes: {},
            } as any)
            fusionService.setFusionAccount(existingIdentity)
            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: { deferredMatching: true },
            })

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            mockMatchingService.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
                const n = Array.from(_candidates).length
                if (candidateType === 'identity') {
                    account.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 95, isMatch: true } as any],
                    } as any)
                }
                return n
            })

            await fusionService.processManagedAccount(mockManagedAccount)

            expect(mockMatchingService.scoreFusionAccount).toHaveBeenCalledTimes(1)
            expect(mockMatchingService.scoreFusionAccount).toHaveBeenCalledWith(
                expect.any(FusionAccount),
                expect.anything(),
                'identity',
                expect.any(Number)
            )
        })

        it('skips Match scoring for record sources when includeRecordAccountsForMatching is false', async () => {
            const mockManagedAccount = {
                id: 'acct-record-skip-match-1',
                nativeIdentity: 'native-record-skip-match-1',
                name: 'Record Only User',
                sourceId: 'src-record-skip',
                sourceName: 'Record Skip Match Source',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(fusionService as any).run.sourcesByName.set('Record Skip Match Source', {
                id: 'src-record-skip',
                name: 'Record Skip Match Source',
                sourceType: 'record',
                config: { includeRecordAccountsForMatching: false },
            })

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            await fusionService.processManagedAccount(mockManagedAccount)

            expect(mockMatchingService.scoreFusionAccount).not.toHaveBeenCalled()
        })

        it('processRecordUniqueRegistration removes match-disabled record accounts from the work queue', async () => {
            const recordAccount = {
                id: 'src-record-skip::native-record-1',
                nativeIdentity: 'native-record-1',
                name: 'Record Only User',
                sourceId: 'src-record-skip',
                sourceName: 'Record Skip Match Source',
                attributes: { externalId: 'EXT-1' },
                uncorrelated: true,
            } as Account
            const authAccount = {
                id: 'src-auth::native-auth-1',
                nativeIdentity: 'native-auth-1',
                name: 'Auth User',
                sourceId: 'src-auth',
                sourceName: 'Auth Source',
                attributes: {},
                uncorrelated: true,
            } as Account
            const managedMap = new Map<string, Account>([
                [recordAccount.id!, recordAccount],
                [authAccount.id!, authAccount],
            ])

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            ;(fusionService as any).run.sourcesByName.set('Record Skip Match Source', {
                id: 'src-record-skip',
                name: 'Record Skip Match Source',
                sourceType: 'record',
                config: { includeRecordAccountsForMatching: false },
            })
            ;(fusionService as any).run.sourcesByName.set('Auth Source', {
                id: 'src-auth',
                name: 'Auth Source',
                sourceType: 'authoritative',
                config: {},
            })

            const registerSpy = vi
                .spyOn(mockDefinitionService, 'registerUniqueValuesFromRecordManagedAccounts')
                .mockResolvedValue(1)

            await fusionService.initializeManagedAccountProcessing()
            const result = await fusionService.processRecordUniqueRegistration()

            expect(result.registered).toBe(1)
            expect(registerSpy).toHaveBeenCalledWith(
                [recordAccount],
                mockMappingService,
                run,
                expect.objectContaining({ onProgress: expect.any(Function) })
            )
            expect(managedMap.has(recordAccount.id!)).toBe(false)
            expect(managedMap.has(authAccount.id!)).toBe(true)
        })

        it('runs Match scoring for record sources when includeRecordAccountsForMatching is omitted (default)', async () => {
            const mockManagedAccount = {
                id: 'acct-record-default-match-1',
                nativeIdentity: 'native-record-default-match-1',
                name: 'Record Default User',
                sourceId: 'src-record-default',
                sourceName: 'Record Default Source',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(fusionService as any).run.sourcesByName.set('Record Default Source', {
                id: 'src-record-default',
                name: 'Record Default Source',
                sourceType: 'record',
                config: {},
            })

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockMatchingService.scoreFusionAccount.mockResolvedValue(0)

            await fusionService.processManagedAccount(mockManagedAccount)

            expect(mockMatchingService.scoreFusionAccount).toHaveBeenCalled()
        })

        it('logs deferred matches and suppresses output for deferred candidate matches', async () => {
            const mockManagedAccount = {
                id: 'acct-deferred-1',
                nativeIdentity: 'native-deferred-1',
                name: 'Deferred User',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: { deferredMatching: true },
            })

            const nonMatchedCandidate = FusionAccount.fromManagedAccount({
                id: 'acct-prev-nonmatch-1',
                nativeIdentity: 'native-prev-nonmatch-1',
                name: 'Non-matched Candidate',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
            nonMatchedCandidate.setNonMatched()
            fusionService.setFusionAccount(nonMatchedCandidate)

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            mockMatchingService.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
                const n = Array.from(_candidates).length
                if (candidateType === 'deferred') {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Non-matched Candidate',
                        candidateType: 'deferred',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true } as any],
                    } as any)
                }
                return n
            })

            const workQueue = new Map([['source-a-id::native-deferred-1', mockManagedAccount]])
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.fusionMatches.some((m) => m.candidateType === 'deferred')).toBe(true)
            expect(workQueue.has('source-a-id::native-deferred-1')).toBe(false)
            expect(mockLog.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        })

        it('does not record deferred match report rows when StdAccountList, fusionReportOnAggregation false, and not custom:dryrun', async () => {
            const mockManagedAccount = {
                id: 'acct-no-report-cap',
                nativeIdentity: 'native-no-report-cap',
                name: 'No Report Cap',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: { deferredMatching: true },
            })

            const nonMatchedCandidate = FusionAccount.fromManagedAccount({
                id: 'acct-prev-nonmatch-cap',
                nativeIdentity: 'native-prev-nonmatch-cap',
                name: 'Non-matched Candidate',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
            nonMatchedCandidate.setNonMatched()
            fusionService.setFusionAccount(nonMatchedCandidate)

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            mockMatchingService.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
                const n = Array.from(_candidates).length
                if (candidateType === 'deferred') {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Non-matched Candidate',
                        candidateType: 'deferred',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true } as any],
                    } as any)
                }
                return n
            })

            const tracker = new AggregationTracker()
            fusionService.setTracker(tracker)
            await fusionService.processManagedAccount(mockManagedAccount)
            const report = fusionService.generateReport(tracker, true)
            expect(report.accounts.some((a) => a.deferred && a.accountId === 'source-a-id::native-no-report-cap')).toBe(
                false
            )
        })

        it('records deferred match report rows for custom:dryrun even when commandType is StdAccountList and fusionReportOnAggregation is false', async () => {
            const customReportFusion = new FusionService(
                mockConfig,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockMappingService,
                mockDefinitionService,
                mockMatchingService,
                mockSchemas,
                run,
                StandardCommand.StdAccountList,
                true
            )
            customReportFusion.matchOutcomeDispatcher = createDispatcherFor(customReportFusion)
            customReportFusion.setTracker(new AggregationTracker())

            const mockManagedAccount = {
                id: 'acct-dry-run-def',
                nativeIdentity: 'native-dry-run-def',
                name: 'Custom Report Deferred',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(customReportFusion as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: { deferredMatching: true },
            })

            const nonMatchedCandidate = FusionAccount.fromManagedAccount({
                id: 'acct-prev-nonmatch-cr',
                nativeIdentity: 'native-prev-nonmatch-cr',
                name: 'Non-matched Candidate CR',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
            nonMatchedCandidate.setNonMatched()
            customReportFusion.setFusionAccount(nonMatchedCandidate)

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            mockMatchingService.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
                const n = Array.from(_candidates).length
                if (candidateType === 'deferred') {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Non-matched Candidate CR',
                        candidateType: 'deferred',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true } as any],
                    } as any)
                }
                return n
            })

            const tracker = new AggregationTracker()
            customReportFusion.setTracker(tracker)
            await customReportFusion.processManagedAccount(mockManagedAccount)
            const report = customReportFusion.generateReport(tracker, true)
            expect(report.accounts.some((a) => a.deferred && a.accountId === 'acct-dry-run-def')).toBe(
                true
            )
        })

        it('records only non-match history when creating a new authoritative non-match fusion account', async () => {
            const mockManagedAccount = {
                id: 'acct-nonmatch-1',
                nativeIdentity: 'NE00002',
                name: 'Matt Usalen NE00002 Assignment00002',
                sourceId: 'src-nerm',
                sourceName: 'NERM',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(fusionService as any).run.sourcesByName.set('NERM', {
                id: 'src-nerm',
                name: 'NERM',
                sourceType: 'authoritative',
                config: {},
            })

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockMatchingService.scoreFusionAccount.mockResolvedValue(0)

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.history.some((h) => h.includes('as NonMatched'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account'))).toBe(false)
        })

        it('does not fire disable for orphan non-matches when commandType is not StdAccountList', async () => {
            const analysisFusion = new FusionService(
                mockConfig,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockMappingService,
                mockDefinitionService,
                mockMatchingService,
                mockSchemas,
                run,
                undefined
            )
            analysisFusion.matchOutcomeDispatcher = createDispatcherFor(analysisFusion)
            analysisFusion.setTracker(new AggregationTracker())
            ;(analysisFusion as any).run.sourcesByName.set('OrphanSrc', {
                id: 'orphan-src-id',
                name: 'OrphanSrc',
                sourceType: 'orphan',
                config: { disableNonMatchingAccounts: true },
            })

            const account = {
                id: 'acct-orphan-analysis-1',
                nativeIdentity: 'native-orphan-a1',
                name: 'Orphan User',
                sourceId: 'orphan-src-id',
                sourceName: 'OrphanSrc',
                attributes: {},
                uncorrelated: true,
            } as Account

            mockMappingService.mapAttributes.mockImplementation((a) => a)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockMatchingService.scoreFusionAccount.mockResolvedValue(0)
            vi.spyOn(mockSources, 'fireDisableAccount').mockResolvedValue(undefined)

            await analysisFusion.processManagedAccount(account)

            expect(mockSources.fireDisableAccount).not.toHaveBeenCalled()
        })

        it('should process managed accounts', async () => {
            const mockManagedAccount = {
                id: 'mgmt-raw-1',
                nativeIdentity: 'mgmt-1',
                name: 'Managed Account 1',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            const managedAccountsMap = new Map<string, Account>()
            managedAccountsMap.set('source-a-id::mgmt-1', mockManagedAccount)

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedAccountsMap)

            // Mock scoring
            mockMatchingService.scoreFusionAccount.mockImplementation(
                async (_account, candidates) => Array.from(candidates).length
            )

            await fusionService.processManagedAccounts()

            // Verify log called or side effects
            expect(mockLog.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Processing 1 managed account(s): analyzing uncorrelated work-queue entries (matching and scoring vs identities)'
                )
            )
        })

        it('should set reverse correlation attribute for first-run non-matched authoritative accounts', async () => {
            const mockManagedAccount = {
                id: 'acct-1',
                nativeIdentity: 'native-1',
                name: 'Managed Account 1',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(mockConfig.sources as any[]).push({
                name: 'Source A',
                correlationMode: 'reverse' as const,
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            })
            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: {},
            })

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.attributes.reverseNativeIdentity).toBe('native-1')
        })

        it('registers correlated managed accounts not linked to Fusion as authoritative non-matches', async () => {
            const mockManagedAccount = {
                id: 'acct-corr-orphan-1',
                nativeIdentity: 'native-corr-orphan-1',
                name: 'Correlated Orphan',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                identityId: 'identity-not-in-fusion',
                attributes: {},
                uncorrelated: false,
            } as Account

            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: {},
            })

            mockMappingService.mapAttributes.mockImplementation((a) => a)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockMatchingService.scoreFusionAccount.mockResolvedValue(0)

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.statuses).toContain('nonMatched')
            expect(fusionService.getFusionAccountByManagedKey('source-a-id::native-corr-orphan-1')).toBe(result)
        })

        it('drops correlated managed accounts when their identity already has a fusion identity row', async () => {
            const identityId = 'identity-linked-1'
            const existing = FusionAccount.fromIdentity({
                id: identityId,
                name: 'Linked',
                attributes: {},
            } as any)
            fusionService.setFusionAccount(existing)

            const mockManagedAccount = {
                id: 'acct-already-linked',
                nativeIdentity: 'native-linked',
                name: 'Already',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                identityId,
                attributes: {},
                uncorrelated: false,
            } as Account

            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: {},
            })

            mockMappingService.mapAttributes.mockImplementation((a) => a)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockMatchingService.scoreFusionAccount.mockResolvedValue(0)

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeUndefined()
        })

        it('should hydrate missing account info during managed-account layer for historical missing accounts', async () => {
            const historicalAccount = {
                nativeIdentity: 'fusion-1',
                identityId: 'identity-1',
                name: 'Fusion Account',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {
                    'missing-accounts': ['source-a-id::native-missing-1'],
                },
            } as unknown as Account

            ;(mockConfig.sources as any[]).push({
                name: 'Source A',
                correlationMode: 'reverse' as const,
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            })

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([
                    [
                        'source-a-id::native-missing-1',
                        {
                            id: 'acct-missing-1',
                            nativeIdentity: 'native-missing-1',
                            sourceId: 'source-a-id',
                            sourceName: 'Source A',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.attributes.reverseNativeIdentity).toBe('native-missing-1')
        })

        it('applies identity layer when platform fusion account is uncorrelated but identityId is in scope', async () => {
            const historicalAccount = {
                nativeIdentity: 'workday-native-1',
                identityId: 'identity-1',
                name: '30958535',
                sourceName: 'Identity Fusion NG',
                uncorrelated: true,
                attributes: {
                    accounts: [],
                    originSource: 'Identities',
                },
            } as unknown as Account

            vi.spyOn(mockIdentities, 'getIdentityById').mockReturnValue({
                id: 'identity-1',
                name: 'Jane Doe',
                attributes: { displayName: 'Jane Q. Doe' },
            } as IdentityDocument)
            vi.spyOn(mockForms, 'getFusionAssignmentDecision').mockReturnValue(undefined)

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map())
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.name).toBe('30958535')
            expect(result.identityDisplayName).toBe('Jane Q. Doe')
        })

        it('writes history when a newly associated managed account is picked up for an identity', async () => {
            const historicalAccount = {
                nativeIdentity: 'fusion-identity-1',
                identityId: 'identity-1',
                name: 'Fusion Identity',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {
                    accounts: ['source-a-id::native-existing-1'],
                },
            } as unknown as Account

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
                new Map([
                    [
                        'source-a-id::native-new-2',
                        {
                            id: 'acct-new-2',
                            name: 'Managed Account New',
                            nativeIdentity: 'native-new-2',
                            sourceId: 'source-a-id',
                            sourceName: 'Source A',
                            identityId: 'identity-1',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(
                new Map([['identity-1', new Set(['source-a-id::native-new-2'])]])
            )
            seedRunInventory(run, new Map([
                    [
                        'source-a-id::native-new-2',
                        {
                            id: 'acct-new-2',
                            name: 'Managed Account New',
                            nativeIdentity: 'native-new-2',
                            sourceId: 'source-a-id',
                            sourceName: 'Source A',
                            identityId: 'identity-1',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.accountIds).toContain('source-a-id::native-new-2')
            expect(result.history).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('Blended managed account Managed Account New [Source A]'),
                ])
            )
        })

        it('should remove deleted managed accounts from accounts and missing-accounts history', async () => {
            const historicalAccount = {
                nativeIdentity: 'fusion-1',
                identityId: 'identity-1',
                name: 'Fusion Account',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {
                    accounts: ['source-a-id::native-existing-1'],
                    'missing-accounts': ['source-a-id::native-deleted-1'],
                    originSource: 'Source A',
                    originAccount: 'source-a-id::native-deleted-1',
                },
            } as unknown as Account

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
                new Map([
                    [
                        'source-a-id::native-existing-1',
                        {
                            id: 'acct-existing-1',
                            nativeIdentity: 'native-existing-1',
                            sourceId: 'source-a-id',
                            sourceName: 'Source A',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([
                    [
                        'source-a-id::native-existing-1',
                        {
                            id: 'acct-existing-1',
                            nativeIdentity: 'native-existing-1',
                            sourceId: 'source-a-id',
                            sourceName: 'Source A',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.accountIds).toContain('source-a-id::native-existing-1')
            expect(result.accountIds).not.toContain('source-a-id::native-deleted-1')
            expect(result.missingAccountIds).toContain('source-a-id::native-existing-1')
            expect(result.missingAccountIds).not.toContain('source-a-id::native-deleted-1')
            expect(result.originSource).toBe('Source A')
            expect(result.originAccountId).toBe('source-a-id::native-deleted-1')
            expect(result.needsRefresh).toBe(true)
            expect(result.history).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('Removed managed account missing reference: source-a-id::native-deleted-1'),
                ])
            )
        })

        it('forces needsRefresh when forceAttributeRefresh is enabled', async () => {
            mockConfig.forceAttributeRefresh = true

            const historicalAccount = {
                nativeIdentity: 'fusion-force-refresh',
                identityId: 'identity-force-refresh',
                name: 'Fusion Force Refresh',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {
                    accounts: [],
                },
            } as unknown as Account

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.needsRefresh).toBe(true)
        })

        it('should not clear reverse attribute when missing account source info is unresolved', async () => {
            ;(fusionService as any).config.sources = [
                {
                    name: 'Source A',
                    correlationMode: 'reverse',
                    correlationAttribute: 'reverseNativeIdentity',
                    correlationDisplayName: 'Reverse Native Identity',
                },
            ]

            const fusionAccount = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                identityId: 'identity-1',
                name: 'Fusion Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['missing-1'],
                    reverseNativeIdentity: 'existing-value',
                },
            } as unknown as Account)

            await (fusionService as any).correlationManager.correlatePerSource(fusionAccount)

            expect(fusionAccount.attributes.reverseNativeIdentity).toBe('existing-value')
        })

        it('direct-correlates link-decision assigned account when managed metadata is absent but source is correlate', async () => {
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
                name: 'Source A',
                correlationMode: 'correlate',
            } as any)

            const fusionAccount = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                identityId: 'identity-1',
                name: 'Fusion Account',
                sourceName: 'Identity Fusion NG',
                attributes: { accounts: ['source-a-id::native-no-meta'] },
            } as unknown as Account)

            const linkDecision = {
                submitter: { id: 'rev-1', email: '', name: 'Reviewer' },
                account: {
                    id: 'source-a-id::native-no-meta',
                    name: 'U',
                    sourceName: 'Source A',
                    sourceId: 'source-a-id',
                    nativeIdentity: 'native-no-meta',
                },
                newIdentity: false,
                identityId: 'identity-1',
                comments: 'Assign',
                finished: true,
            } as any

            fusionAccount.addFusionDecisionLayer(linkDecision)
            expect(fusionAccount.getManagedAccountInfo('source-a-id::native-no-meta')).toBeUndefined()

            await (fusionService as any).correlationManager.correlatePerSource(fusionAccount, linkDecision)

            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(fusionAccount, [
                'source-a-id::native-no-meta',
            ])
        })

        it('sets reverse correlation attribute for non-matched authoritative accounts without checking platform prerequisites', async () => {
            const mockManagedAccount = {
                id: 'acct-2',
                nativeIdentity: 'native-2',
                name: 'Managed Account 2',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account

            ;(mockConfig.sources as any[]).push({
                name: 'Source A',
                correlationMode: 'reverse' as const,
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            })
            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: {},
            })

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.attributes.reverseNativeIdentity).toBe('native-2')
        })
    })

    describe('analyzeUncorrelatedAccounts', () => {
        it('uses first authoritative non-match as deferred candidate for subsequent account analysis', async () => {
            const firstAccount = {
                id: 'acct-analyze-1',
                nativeIdentity: 'native-analyze-1',
                name: 'A. Wesker',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account
            const secondAccount = {
                id: 'acct-analyze-2',
                nativeIdentity: 'native-analyze-2',
                name: 'Albert Wesker',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
                new Map([
                    ['source-a-id::native-analyze-1', firstAccount],
                    ['source-a-id::native-analyze-2', secondAccount],
                ])
            )
            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: {},
            })
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            mockMatchingService.scoreFusionAccount.mockImplementation(async (account, candidates, candidateType) => {
                const candidateList = Array.from(candidates)
                if (candidateType !== 'deferred') return candidateList.length
                if (candidateList.length > 0) {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'A. Wesker',
                        candidateType: 'deferred',
                        scores: [
                            { attribute: 'lastname', algorithm: 'jaro-winkler', score: 100, isMatch: true } as any,
                        ],
                    } as any)
                }
                return candidateList.length
            })

            // Pre-register first account in fusionAccountMap for deferred candidate visibility
            const preFirst = FusionAccount.fromManagedAccount(firstAccount)
            preFirst.setNonMatched()
            ;(fusionService as any).setFusionAccount(preFirst)

            const analyzed = await fusionService.analyzeUncorrelatedAccounts()

            expect(analyzed).toHaveLength(2)
            expect(analyzed[1].fusionMatches.some((match) => match.candidateType === 'deferred')).toBe(true)
            expect(mockLog.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        })

        it('makes previously-persisted non-match accounts visible as deferred candidates', async () => {
            const persistedNonMatch = FusionAccount.fromManagedAccount({
                id: 'acct-persisted-nonmatch',
                nativeIdentity: 'native-persisted-nonmatch',
                name: 'Previously Persisted Non-Match',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
            persistedNonMatch.setNonMatched()
            fusionService.setFusionAccount(persistedNonMatch)
            run.registerDeferredCandidate(persistedNonMatch)

            ;(fusionService as any).run.sourcesByName.set('Source A', {
                id: 'source-a-id',
                name: 'Source A',
                sourceType: 'authoritative',
                config: { deferredMatching: true },
            })

            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const newAccount = {
                id: 'acct-new-revisit',
                nativeIdentity: 'native-new-revisit',
                name: 'Previously Persisted Non-Match',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
                uncorrelated: true,
            } as Account
            const workQueue = new Map([['source-a-id::native-new-revisit', newAccount]])
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())

            let deferredCandidatesFound = 0
            mockMatchingService.scoreFusionAccount.mockImplementation(async (_account, candidates, candidateType) => {
                const n = Array.from(candidates).length
                if (candidateType === 'deferred') {
                    deferredCandidatesFound = n
                    if (n > 0) {
                        _account.addFusionMatch({
                            identityId: '',
                            identityName: 'Previously Persisted Non-Match',
                            candidateType: 'deferred',
                            scores: [
                                { attribute: 'name', algorithm: 'jaro-winkler', score: 94, isMatch: true } as any,
                            ],
                        } as any)
                    }
                }
                return n
            })

            await fusionService.analyzeUncorrelatedAccounts()

            expect(deferredCandidatesFound).toBeGreaterThanOrEqual(1)
        })
    })

    describe('setFusionAccount routing', () => {
        it('routes fusion account with identityId to fusionIdentityMap even when _uncorrelated is true', () => {
            // Simulate what processFusionAccount does after updateCorrelationStatus sets _uncorrelated=true
            const account = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-uncorr-1',
                identityId: 'identity-1',
                name: 'Jane Doe',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: { accounts: ['acct-missing-1'] },
            } as unknown as Account)
            // Simulate the flag that updateCorrelationStatus would set
            account.addMissingAccountId('acct-missing-1')
            account.updateCorrelationStatus()
            expect(account.uncorrelated).toBe(true)

            fusionService.setFusionAccount(account)

            const inIdentityMap = fusionService.getFusionIdentity('identity-1')
            const inAccountMap = fusionService.getFusionAccountByManagedKey(`fusion-uncorr-1`)
            expect(inIdentityMap).toBe(account)
            expect(inAccountMap).toBeUndefined()
        })

        it('routes fusion account without identityId to fusionAccountMap', () => {
            const account = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-noident-1',
                name: 'Non-matched Account',
                sourceName: 'Identity Fusion NG',
                uncorrelated: true,
                attributes: {},
            } as unknown as Account)

            fusionService.setFusionAccount(account)

            const inAccountMap = fusionService.getFusionAccountByManagedKey(`fusion-noident-1`)
            expect(inAccountMap).toBe(account)
        })

        it('routes a persisted fusion account into fusionIdentityMap via the attributes.identityId fallback', () => {
            // Realistic SDK payload: no top-level identityId, only the persisted attribute.
            // This is the data shape produced by the connector's own getISCAccount output.
            const account = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-attr-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                attributes: { identityId: 'identity-1' },
            } as unknown as Account)

            fusionService.setFusionAccount(account)

            expect(fusionService.getFusionIdentity('identity-1')).toBe(account)
            expect(fusionService.getFusionAccountByManagedKey(`fusion-attr-1`)).toBeUndefined()
        })

        it('stores persisted fusion accounts under the fusion-source composite key', () => {
            const account = FusionAccount.fromFusionAccount({
                nativeIdentity: 'legacy-native-id',
                name: 'Legacy Non-matched',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    originAccount: 'source-a-id::shared-native-id',
                },
            } as unknown as Account)

            fusionService.setFusionAccount(account)

            expect(account.originAccountId).toBe('source-a-id::shared-native-id')
            expect(fusionService.getFusionAccountByManagedKey(`legacy-native-id`)).toBe(account)
        })

        it('normalizes persisted origin composite key when restoring non-matched managed source accounts', () => {
            const account = FusionAccount.fromFusionAccount({
                nativeIdentity: 'legacy-native-id',
                name: 'Legacy Non-matched',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    originAccount: ' source-a-id :: shared-native-id ',
                },
            } as unknown as Account)

            fusionService.setFusionAccount(account)

            expect(account.originAccountId).toBe('source-a-id::shared-native-id')
            expect(fusionService.getFusionAccountByManagedKey(`legacy-native-id`)).toBe(account)
        })
    })

    describe('identity conflict warnings', () => {
        it('logs warning and includes identity conflict details in report', () => {
            const tracker = new AggregationTracker()
            fusionService.setTracker(tracker)
            const accountA = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-duplicate',
                name: 'Fusion Account A',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)
            const accountB = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-b',
                identityId: 'identity-duplicate',
                name: 'Fusion Account B',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)

            fusionService.setFusionAccount(accountA)
            fusionService.setFusionAccount(accountB)

            expect(mockLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('More than one Fusion account was found for identity identity-duplicate')
            )

            const report = fusionService.generateReport(tracker)
            const conflictWarnings = report.warnings?.identityConflicts

            expect(conflictWarnings?.affectedIdentities).toBe(1)
            expect(conflictWarnings?.occurrences).toHaveLength(1)
            expect(conflictWarnings?.occurrences[0].identityId).toBe('identity-duplicate')
            expect(conflictWarnings?.occurrences[0].accountCount).toBe(2)
            expect(conflictWarnings?.occurrences[0].managedKeys).toEqual([
                `fusion-a`,
                `fusion-b`,
            ])
        })

        it('does not warn when the same correlated account key is updated', () => {
            const tracker = new AggregationTracker()
            fusionService.setTracker(tracker)
            const original = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-1',
                name: 'Fusion Account A',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)
            const refreshed = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-1',
                name: 'Fusion Account A Refreshed',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)

            fusionService.setFusionAccount(original)
            fusionService.setFusionAccount(refreshed)

            expect(mockLog.warn).not.toHaveBeenCalled()

            const report = fusionService.generateReport(tracker)
            expect(report.warnings).toBeUndefined()
        })

        it('clears identity conflict warning payload after report generation', () => {
            const tracker = new AggregationTracker()
            fusionService.setTracker(tracker)
            const accountA = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-duplicate',
                name: 'Fusion Account A',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)
            const accountB = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-b',
                identityId: 'identity-duplicate',
                name: 'Fusion Account B',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)

            fusionService.setFusionAccount(accountA)
            fusionService.setFusionAccount(accountB)

            const firstReport = fusionService.generateReport(tracker)
            expect(firstReport.warnings?.identityConflicts?.affectedIdentities).toBe(1)

            const secondReport = fusionService.generateReport(tracker)
            expect(secondReport.warnings).toBeUndefined()
        })
    })

    describe('processFusionIdentityDecision sourceType branches', () => {
        it('updates the existing fusion identity account for authorized decisions', async () => {
            const existingIdentity = {
                id: 'identity-1',
                name: 'Existing Identity',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument
            const existingFusionAccount = FusionAccount.fromIdentity(existingIdentity)
            existingFusionAccount.setNonMatched()
            fusionService.setFusionAccount(existingFusionAccount)

            const managedAccount = {
                id: 'acct-authz-existing-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-authz-existing',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKey = 'src-lh2::lh2-authz-existing'
            const managedMap = new Map<string, Account>([[managedKey, managedAccount]])

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([[managedKey, managedAccount]])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
                name: 'LH2',
                correlationMode: 'correlate',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKey,
                    name: 'LH2 User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-authz-existing',
                },
                newIdentity: false,
                identityId: 'identity-1',
                comments: 'Assign to existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)

            expect(result).toBe(existingFusionAccount)
            expect(result?.needsReset).toBe(false)
            expect(result?.statuses).toContain('authorized')
            expect(result?.statuses).not.toContain('auto')
            expect(result?.statuses).not.toContain('nonMatched')
            expect(result?.history.some((h) => h.includes('as authorized by Reviewer'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(existingFusionAccount, [managedKey])
            expect(fusionService.getFusionIdentity('identity-1')).toBe(existingFusionAccount)
        })

        it('writes auto-assignment history for system automatic-assignment decisions', async () => {
            const existingIdentity = {
                id: 'identity-2',
                name: 'Existing Identity Two',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument
            const existingFusionAccount = FusionAccount.fromIdentity(existingIdentity)
            fusionService.setFusionAccount(existingFusionAccount)

            const managedAccount = {
                id: 'acct-auto-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-auto',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKeyAuto = 'src-lh2::lh2-auto'
            const managedMap = new Map<string, Account>([[managedKeyAuto, managedAccount]])

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([[managedKeyAuto, managedAccount]])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
                name: 'LH2',
                correlationMode: 'none',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'system', email: '', name: 'System (automatic assignment)' },
                account: {
                    id: managedKeyAuto,
                    name: 'LH2 User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-auto',
                },
                newIdentity: false,
                identityId: 'identity-2',
                comments: 'Automatically assigned: exact attribute match (all rules 100, none skipped)',
                finished: true,
                sourceType: 'authoritative',
                automaticAssignment: true,
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)
            expect(result?.statuses).toContain('auto')
            expect(result?.statuses).not.toContain('authorized')
            expect(result?.history.some((h) => h.includes('Auto-assigned LH2 User [LH2] to existing identity'))).toBe(
                true
            )
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
            expect(mockIdentities.correlateAccounts).not.toHaveBeenCalled()
        })

        it('system automatic assignment still PATCHes accounts when source correlationMode is correlate', async () => {
            const existingIdentity = {
                id: 'identity-auto-corr',
                name: 'Identity Auto Corr',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument
            const existingFusionAccount = FusionAccount.fromIdentity(existingIdentity)
            fusionService.setFusionAccount(existingFusionAccount)

            const managedAccount = {
                id: 'acct-auto-corr-1',
                name: 'User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-auto-corr',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKeyAutoCorr = 'src-lh2::lh2-auto-corr'
            const managedMap = new Map<string, Account>([[managedKeyAutoCorr, managedAccount]])

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([[managedKeyAutoCorr, managedAccount]])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
                name: 'LH2',
                correlationMode: 'correlate',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'system', email: '', name: 'System (automatic assignment)' },
                account: {
                    id: managedKeyAutoCorr,
                    name: 'User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-auto-corr',
                },
                newIdentity: false,
                identityId: 'identity-auto-corr',
                comments: 'Automatically assigned: exact attribute match (all rules 100, none skipped)',
                finished: true,
                sourceType: 'authoritative',
                automaticAssignment: true,
            } as any

            await fusionService.processFusionIdentityDecision(decision)
            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(expect.any(FusionAccount), [
                managedKeyAutoCorr,
            ])
        })

        it('suppresses generic association history for authorized decisions without identityId', async () => {
            const managedAccount = {
                id: 'acct-authz-no-id-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-authz-noid',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKeyNoId = 'src-lh2::lh2-authz-noid'
            const managedMap = new Map<string, Account>([[managedKeyNoId, managedAccount]])

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([[managedKeyNoId, managedAccount]])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKeyNoId,
                    name: 'LH2 User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-authz-noid',
                },
                newIdentity: false,
                identityId: undefined,
                comments: 'Assign to existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)
            expect(result?.history.some((h) => h.includes('as authorized by Reviewer'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
        })

        it('correlates accounts for authorized decisions to the selected identity in the same run', async () => {
            const managedAccount = {
                id: 'acct-authz-1',
                name: 'Authorized User',
                sourceId: 'src-auth-src',
                nativeIdentity: 'auth-src-native-1',
                sourceName: 'Authoritative Source',
                attributes: {},
            } as Account
            const managedKeyAuthz = 'src-auth-src::auth-src-native-1'
            const managedMap = new Map<string, Account>([[managedKeyAuthz, managedAccount]])

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([[managedKeyAuthz, managedAccount]])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(undefined as any)
            mockIdentities.fetchIdentityById.mockResolvedValue({
                id: 'identity-1',
                name: 'Identity One',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
                name: 'Authoritative Source',
                correlationMode: 'correlate',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKeyAuthz,
                    name: 'Authorized User',
                    sourceName: 'Authoritative Source',
                    sourceId: 'src-auth-src',
                    nativeIdentity: 'auth-src-native-1',
                },
                newIdentity: false,
                identityId: 'identity-1',
                comments: 'Assign to existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            await fusionService.processFusionIdentityDecision(decision)

            expect(mockIdentities.correlateAccounts).toHaveBeenCalledTimes(1)
            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(expect.any(FusionAccount), [managedKeyAuthz])
        })

        it('registers unique attributes and skips output for record no-match decisions', async () => {
            const managedKey = 'src-record-src::record-native-1'
            const managedAccount = {
                id: managedKey,
                name: 'Record User',
                sourceName: 'Record Source',
                sourceId: 'src-record-src',
                nativeIdentity: 'record-native-1',
                attributes: {},
            } as Account
            const managedMap = new Map<string, Account>([[managedKey, managedAccount]])
            Object.defineProperty(run, 'managedAccountsById', {
                get: () => managedMap,
                configurable: true,
            })
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([[managedKey, managedAccount]]))
            run.sourcesByName.set('Record Source', {
                id: 'src-record-src',
                name: 'Record Source',
                sourceType: 'record',
                config: {},
            })
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            mockDefinitionService.registerUniqueAttributes.mockResolvedValue()
            const registerRecordSpy = vi
                .spyOn(mockDefinitionService, 'registerUniqueValuesFromRecordManagedAccount')
                .mockResolvedValue(undefined)

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKey,
                    name: 'Record User',
                    sourceName: 'Record Source',
                    sourceId: 'src-record-src',
                    nativeIdentity: 'record-native-1',
                },
                newIdentity: true,
                identityId: undefined,
                comments: 'No matching identity',
                finished: true,
                sourceType: 'record',
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)

            expect(result).toBeUndefined()
            expect(registerRecordSpy).toHaveBeenCalledWith(managedAccount, mockMappingService, run)
            expect(mockDefinitionService.registerUniqueAttributes).not.toHaveBeenCalled()
        })

        it('safely skips orphan disable queue when account is no longer in managed map', async () => {
            const managedKeyOrphan = 'src-orphan-1::orphan-native-1'
            const managedMap = new Map<string, Account>()

            Object.defineProperty(run, 'managedAccountsById', {
                get: () => managedMap,
                configurable: true,
            })
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map())
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            ;(fusionService as any).run.sourcesByName.set('Orphan Source', {
                id: 'src-orphan-1',
                name: 'Orphan Source',
                sourceType: 'orphan',
                config: { disableNonMatchingAccounts: true },
            })

            const queueDisableSpy = vi
                .spyOn(fusionService.run, 'queueDisableOperation')
                .mockImplementation(() => {})
            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKeyOrphan,
                    name: 'Orphan User',
                    sourceName: 'Orphan Source',
                    sourceId: 'src-orphan-1',
                    nativeIdentity: 'orphan-native-1',
                },
                newIdentity: true,
                identityId: undefined,
                comments: 'Reject orphan match',
                finished: true,
                sourceType: 'orphan',
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)

            expect(result).toBeUndefined()
            expect(queueDisableSpy).not.toHaveBeenCalled()
        })

        it('registers a new fusion account for authoritative new-identity decisions', async () => {
            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map())
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const setFusionAccountSpy = vi.spyOn(fusionService.run, 'registerFusionAccount')
            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: 'src-auth-src::auth-new-native-1',
                    name: 'Auth User',
                    sourceName: 'Authoritative Source',
                    sourceId: 'src-auth-src',
                    nativeIdentity: 'auth-new-native-1',
                },
                newIdentity: true,
                identityId: undefined,
                comments: 'Create new identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)

            expect(result).toBeDefined()
            expect(setFusionAccountSpy).toHaveBeenCalledTimes(1)
        })
    })

    describe('history consistency safeguards', () => {
        it('does not duplicate set-history messages on no-op add', () => {
            const fusionAccount = FusionAccount.fromManagedAccount({
                id: 'acct-history-noop-1',
                name: 'History User',
                sourceId: 'src-history',
                nativeIdentity: 'hist-noop',
                sourceName: 'History Source',
                attributes: {},
            } as Account)

            fusionAccount.addStatus(StatusEntitlement.Candidate, 'Set candidate status')
            fusionAccount.addStatus(StatusEntitlement.Candidate, 'Set candidate status')

            const duplicateMessages = fusionAccount.history.filter((h) => h.includes('Set candidate status'))
            expect(duplicateMessages).toHaveLength(1)
        })

        it('normalizes imported history by trimming and removing blank entries', () => {
            const fusionAccount = FusionAccount.fromManagedAccount({
                id: 'acct-history-import-1',
                name: 'History User',
                sourceId: 'src-history',
                nativeIdentity: 'hist-import',
                sourceName: 'History Source',
                attributes: {},
            } as Account)

            fusionAccount.importHistory(['   ', 'first-entry', 'first-entry', '  second-entry  '])

            expect(fusionAccount.history).toEqual(['first-entry', 'second-entry'])
        })

        it('uses fallback labels when decision names are blank', async () => {
            const managedAccount = {
                id: 'acct-history-fallback-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'hist-fallback',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const histKey = 'src-lh2::hist-fallback'
            const managedMap = new Map<string, Account>([[histKey, managedAccount]])

            vi.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(run, new Map([[histKey, managedAccount]])
            )
            mockMappingService.mapAttributes.mockImplementation((account) => account)
            mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const decision = {
                submitter: { id: 'reviewer-1', email: ' ', name: ' ' },
                account: {
                    id: histKey,
                    name: '  ',
                    sourceName: '  ',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'hist-fallback',
                },
                newIdentity: false,
                comments: 'Assign to existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)
            expect(
                result?.history.some((h) =>
                    h.includes('Set Unknown account [Unknown source] as authorized by Unknown reviewer')
                )
            ).toBe(true)
        })
    })

    describe('forEachISCAccount performance behavior', () => {
        it('uses bounded concurrency while preserving output order', async () => {
            const sentKeys: string[] = []
            const accounts = Array.from({ length: 28 }, (_, i) =>
                FusionAccount.fromManagedAccount({
                    id: `acct-${i}`,
                    name: `Account ${i}`,
                    sourceId: 'src-1',
                    nativeIdentity: `native-${i}`,
                    sourceName: 'Source 1',
                    attributes: {},
                } as Account)
            )

            for (const account of accounts) {
                fusionService.setFusionAccount(account)
            }

            let inFlight = 0
            let maxInFlight = 0
            vi.spyOn(fusionService as any, 'getISCAccount').mockImplementation(async (...args: any[]) => {
                const account = args[0] as FusionAccount
                inFlight += 1
                maxInFlight = Math.max(maxInFlight, inFlight)
                await new Promise((resolve) => setTimeout(resolve, 1))
                inFlight -= 1
                return { key: account.managedKey, attributes: {}, disabled: false }
            })

            const { sent: count } = await fusionService.forEachISCAccount((account) => {
                sentKeys.push(String(account.key))
            })

            expect(count).toBe(accounts.length)
            expect(maxInFlight).toBeLessThanOrEqual(12)
            expect(sentKeys).toEqual(accounts.map((x) => x.managedKey))
        })
    })

    describe('initializeManagedAccountProcessing captureBreakdown wiring', () => {
        async function initializeWithReportCaptureFlag(shouldCaptureReportData: boolean): Promise<FusionService> {
            const localRun = new FusionRun()
            localRun.log = mockLog
            Object.defineProperty(localRun, 'managedAccountsById', {
                get: () => new Map(),
                configurable: true,
            })

            mockMatchingService.buildTrigramIndex = vi.fn()
            mockMatchingService.setCaptureBreakdown = vi.fn()

            const service = new FusionService(
                mockConfig,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockMappingService,
                mockDefinitionService,
                mockMatchingService,
                mockSchemas,
                localRun,
                StandardCommand.StdAccountList,
                shouldCaptureReportData
            )
            service.setTracker(new AggregationTracker())

            await service.initializeManagedAccountProcessing()
            return service
        }

        it('sets captureBreakdown false when report capture is disabled', async () => {
            await initializeWithReportCaptureFlag(false)
            expect(mockMatchingService.setCaptureBreakdown).toHaveBeenCalledWith(false)
        })

        it('sets captureBreakdown true when report capture is enabled', async () => {
            vi.mocked(mockMatchingService.setCaptureBreakdown).mockClear()
            await initializeWithReportCaptureFlag(true)
            expect(mockMatchingService.setCaptureBreakdown).toHaveBeenCalledWith(true)
        })
    })
})
