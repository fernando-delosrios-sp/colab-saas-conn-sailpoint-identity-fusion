import { FusionService } from '../fusionService'
import { LogService } from '../../logService'
import { IdentityService } from '../../identityService'
import { SourceService } from '../../sourceService'
import { FormService } from '../../formService'
import { AttributeService } from '../../attributeService'
import { ScoringService } from '../../scoringService'
import { SchemaService } from '../../schemaService'
import { ServiceRegistry } from '../../serviceRegistry'
import { FusionConfig } from '../../../model/config'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from '../../../model/account'

// Mock dependencies
jest.mock('../../logService')
jest.mock('../../identityService')
jest.mock('../../sourceService')
jest.mock('../../formService')
jest.mock('../../attributeService')
jest.mock('../../scoringService')
jest.mock('../../schemaService')

describe('FusionService', () => {
    let fusionService: FusionService
    let mockLog: jest.Mocked<LogService>
    let mockIdentities: jest.Mocked<IdentityService>
    let mockSources: jest.Mocked<SourceService>
    let mockForms: jest.Mocked<FormService>
    let mockAttributes: jest.Mocked<AttributeService>
    let mockScoring: jest.Mocked<ScoringService>
    let mockSchemas: jest.Mocked<SchemaService>
    let mockConfig: FusionConfig

    beforeEach(() => {
        // Mock config with Type assertion
        mockConfig = {
            reset: false,
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
        mockLog = new LogService({ spConnDebugLoggingEnabled: false }) as jest.Mocked<LogService>
        const mockClient = {} as any
        mockSources = new SourceService(mockConfig, mockLog, mockClient) as jest.Mocked<SourceService>
        mockIdentities = new IdentityService(mockConfig, mockLog, mockClient, mockSources) as jest.Mocked<IdentityService>
        mockForms = new FormService(
            mockConfig,
            mockLog,
            mockClient,
            mockSources,
            mockIdentities
        ) as jest.Mocked<FormService>
        const mockLocks = {} as any
        mockSchemas = new SchemaService(mockConfig, mockLog, mockSources) as jest.Mocked<SchemaService>
        mockAttributes = new AttributeService(
            mockConfig,
            mockSchemas,
            mockSources,
            mockLog,
            mockLocks
        ) as jest.Mocked<AttributeService>
        mockScoring = new ScoringService(mockConfig, mockLog) as jest.Mocked<ScoringService>

        // Mock specific properties/methods needed for initialization
        Object.defineProperty(mockSources, 'managedAccountsById', {
            get: jest.fn(() => new Map()),
            configurable: true,
        })
        Object.defineProperty(mockSources, 'managedAccountsByIdentityId', {
            get: jest.fn(() => new Map()),
            configurable: true,
        })
        Object.defineProperty(mockSources, 'managedAccountsAllById', {
            get: jest.fn(() => new Map()),
            configurable: true,
        })
        Object.defineProperty(mockSources, 'fusionAccounts', {
            get: jest.fn(() => []),
            configurable: true,
        })
        Object.defineProperty(mockSources, 'managedSources', {
            get: jest.fn(() => []),
            configurable: true,
        })
        Object.defineProperty(mockIdentities, 'identities', {
            get: jest.fn(() => []),
            configurable: true,
        })
        Object.defineProperty(mockSchemas, 'fusionDisplayAttribute', {
            get: jest.fn(() => 'displayName'),
            configurable: true,
        })

        mockSources.resolveIscAccountIdForManagedKey = jest.fn((managedKey: string) => {
            const work = mockSources.managedAccountsById as unknown as Map<string, Account> | undefined
            const all = mockSources.managedAccountsAllById as unknown as Map<string, Account> | undefined
            const acc =
                (work instanceof Map ? work.get(managedKey) : undefined) ??
                (all instanceof Map ? all.get(managedKey) : undefined)
            const raw = acc?.id
            if (raw != null && String(raw).trim() !== '') return String(raw).trim()
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
            mockAttributes,
            mockScoring,
            mockSchemas,
            StandardCommand.StdAccountList
        )

        // Mock ServiceRegistry
        jest.spyOn(ServiceRegistry, 'getCurrent').mockReturnValue({
            fusion: fusionService,
            sources: mockSources,
            identities: mockIdentities,
            schemas: mockSchemas,
            attributes: mockAttributes,
            forms: mockForms,
            scoring: mockScoring,
            log: mockLog,
        } as unknown as ServiceRegistry)
    })

    describe('initialization', () => {
        it('should initialize with provided config', () => {
            expect(fusionService).toBeDefined()
            expect(fusionService.isReset()).toBe(false)
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

            jest.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockAccount])

            // Mock FusionAccount.fromFusionAccount static method if possible,
            // but since it's a class method we might depend on its implementation or mock the return of processFusionAccount
            // For unit testing FusionService, we want to see if it calls processFusionAccount.

            // Since processFusionAccounts calls processFusionAccount internally, let's spy on that if we can,
            // or verify side effects.

            const result = await fusionService.processFusionAccounts()

            expect(result).toHaveLength(1)
            expect(result[0].nativeIdentity).toBe('fusion-1')
        })

        it('removes the correlated identity from the identity work queue after processing', async () => {
            const identityId = 'identity-claimed-1'
            const mockAccount = {
                nativeIdentity: 'fusion-claimed-1',
                identityId,
                attributes: {
                    id: 'fusion-claimed-1',
                    name: 'Claimed Fusion Account',
                    statuses: [],
                    accounts: [],
                },
            } as unknown as Account

            jest.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockAccount])
            mockIdentities.getIdentityById.mockReturnValue(undefined)
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

            // deleteIdentity must exist on the mock (it's a new method)
            mockIdentities.deleteIdentity = jest.fn()

            await fusionService.processFusionAccounts()

            expect(mockIdentities.deleteIdentity).toHaveBeenCalledWith(identityId)
        })

        it('does not call deleteIdentity for uncorrelated fusion accounts (no identityId)', async () => {
            const mockAccount = {
                nativeIdentity: 'fusion-uncorrelated-1',
                identityId: undefined,
                attributes: {
                    id: 'fusion-uncorrelated-1',
                    name: 'Uncorrelated Fusion Account',
                    statuses: [],
                    accounts: [],
                },
            } as unknown as Account

            jest.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockAccount])
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

            mockIdentities.deleteIdentity = jest.fn()

            await fusionService.processFusionAccounts()

            expect(mockIdentities.deleteIdentity).not.toHaveBeenCalled()
        })

        it('ensures processIdentities skips an identity after processFusionAccounts claims it', async () => {
            const identityId = 'identity-dedup-1'
            const mockFusionAccount = {
                nativeIdentity: 'fusion-dedup-1',
                identityId,
                attributes: {
                    id: 'fusion-dedup-1',
                    name: 'Dedup Fusion Account',
                    statuses: [],
                    accounts: [],
                },
            } as unknown as Account

            const mockIdentityDoc = { id: identityId, name: 'Dedup Identity' } as IdentityDocument

            jest.spyOn(mockSources, 'fusionAccounts', 'get').mockReturnValue([mockFusionAccount])
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

            // deleteIdentity removes identity from the service cache; simulate this by tracking calls
            const deletedIds = new Set<string>()
            mockIdentities.deleteIdentity = jest.fn((id: string) => { deletedIds.add(id) })

            // identities getter returns only those not yet deleted
            const allIdentities = [mockIdentityDoc]
            jest.spyOn(mockIdentities, 'identities', 'get').mockImplementation(() =>
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
    })

    describe('FusionAccount identity reference hydration', () => {
        it('hydrates identity name from prior fusion account identity reference when Identity document is unavailable', () => {
            const prior = {
                nativeIdentity: 'fusion-identity-1',
                name: '',
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

            expect(fusionAccount.name).toBe('Jane Identity (from ref)')
            expect(fusionAccount.displayName).toBe('Jane Identity (from ref)')
            expect(fusionAccount.identityDisplayName).toBe('Jane Identity (from ref)')
            expect((fusionAccount.attributeBag.identity as any)?.name).toBeUndefined()
        })

        it('prefers Identity document name when identity layer is applied', () => {
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
                attributes: {},
            } as unknown as IdentityDocument

            fusionAccount.addIdentityLayer(identityDoc)

            expect(fusionAccount.name).toBe('Authoritative Identity Name')
        })
    })

    describe('processIdentities', () => {
        it('should process new identities', async () => {
            const mockIdentity = {
                id: 'identity-1',
                name: 'New Identity',
            } as IdentityDocument

            jest.spyOn(mockIdentities, 'identities', 'get').mockReturnValue([mockIdentity])

            // Mock mapAttributes since it's called in processIdentity
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            const result = await fusionService.processIdentities()

            expect(result).toHaveLength(1)
            expect(result[0].identityId).toBe('identity-1')
            // Should be registered in the map
            expect(fusionService.getFusionIdentity('identity-1')).toBeDefined()
        })

        it('marks new identity-backed fusion accounts for unique reset', async () => {
            const mockIdentity = {
                id: 'identity-reset-1',
                name: 'Reset Identity',
            } as IdentityDocument

            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

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

            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            const result = await fusionService.processIdentity(mockIdentity)

            expect(result).toBeDefined()
            expect(result?.history).toEqual(expect.arrayContaining([expect.stringContaining('Set Jane Doe [Identities] as baseline')]))
            expect(result?.history.some((entry) => entry.includes('Set identity-12345 [Identities] as baseline'))).toBe(false)
        })

        it('should skip existing identities', async () => {
            const mockIdentity = {
                id: 'identity-1',
                name: 'New Identity',
            } as IdentityDocument
            jest.spyOn(mockIdentities, 'identities', 'get').mockReturnValue([mockIdentity])

            await fusionService.processIdentity(mockIdentity)
            const result = await fusionService.processIdentity(mockIdentity)

            expect(result).toBeUndefined()
        })
    })

    describe('processManagedAccounts', () => {
        it('uses newly unmatched current-run accounts as deferred candidates for subsequent managed accounts', async () => {
            const firstAccount = {
                id: 'acct-seq-1',
                nativeIdentity: 'native-seq-1',
                name: 'Taylor Jordan',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account
            const secondAccount = {
                id: 'acct-seq-2',
                nativeIdentity: 'native-seq-2',
                name: 'Taylor Jordan',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account

            const workQueue = new Map([
                ['source-a-id::native-seq-1', firstAccount],
                ['source-a-id::native-seq-2', secondAccount],
            ])
            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedSources', 'get').mockReturnValue([])
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            mockScoring.scoreFusionAccount.mockImplementation(async (account, candidates, candidateType) => {
                const candidateList = Array.from(candidates)
                if (candidateType !== 'new-unmatched') return candidateList.length
                if (candidateList.length > 0) {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Current run unmatched',
                        candidateType: 'new-unmatched',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 94, isMatch: true } as any],
                    } as any)
                }
                return candidateList.length
            })

            await fusionService.processManagedAccounts()

            expect(fusionService.fusionAccounts).toHaveLength(1)
            expect(workQueue.has('source-a-id::native-seq-2')).toBe(false)
            expect(mockLog.info).toHaveBeenCalledWith(expect.stringMatching(/DEFERRED .*MATCH FOUND/))
        })

        it('short-circuits duplicate checks when an identity-backed match already exists', async () => {
            const mockManagedAccount = {
                id: 'acct-short-circuit-1',
                nativeIdentity: 'native-short-circuit-1',
                name: 'Managed Account 1',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account
            const existingIdentity = FusionAccount.fromIdentity({
                id: 'identity-1',
                name: 'Identity One',
                attributes: {},
            } as any)
            fusionService.setFusionAccount(existingIdentity)

            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            mockScoring.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
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

            await fusionService.analyzeManagedAccount(mockManagedAccount)

            expect(mockScoring.scoreFusionAccount).toHaveBeenCalledTimes(1)
            expect(mockScoring.scoreFusionAccount).toHaveBeenCalledWith(expect.any(FusionAccount), expect.anything(), 'identity')
        })

        it('logs deferred matches and suppresses output for new-unmatched candidate matches', async () => {
            const mockManagedAccount = {
                id: 'acct-deferred-1',
                nativeIdentity: 'native-deferred-1',
                name: 'Deferred User',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account

                ; (fusionService as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })

            const unmatchedCandidate = FusionAccount.fromManagedAccount({
                id: 'acct-prev-unmatched-1',
                nativeIdentity: 'native-prev-unmatched-1',
                name: 'Unmatched Candidate',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
                ; (fusionService as any).fusionAccountMap.set('source-a-id::native-prev-unmatched-1', unmatchedCandidate)
                ; (fusionService as any).currentRunUnmatchedFusionNativeIdentities.add(
                    'source-a-id::native-prev-unmatched-1'
                )

            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            mockScoring.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
                const n = Array.from(_candidates).length
                if (candidateType === 'new-unmatched') {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Unmatched Candidate',
                        candidateType: 'new-unmatched',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true } as any],
                    } as any)
                }
                return n
            })

            const workQueue = new Map([['source-a-id::native-deferred-1', mockManagedAccount]])
            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(workQueue)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeUndefined()
            expect(workQueue.has('source-a-id::native-deferred-1')).toBe(false)
            expect(mockLog.info).toHaveBeenCalledWith(expect.stringMatching(/DEFERRED .*MATCH FOUND/))
        })

        it('does not record deferred match report rows when StdAccountList, fusionReportOnAggregation false, and not custom:dryrun', async () => {
            const mockManagedAccount = {
                id: 'acct-no-report-cap',
                nativeIdentity: 'native-no-report-cap',
                name: 'No Report Cap',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account

                ; (fusionService as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })

            const unmatchedCandidate = FusionAccount.fromManagedAccount({
                id: 'acct-prev-unmatched-cap',
                nativeIdentity: 'native-prev-unmatched-cap',
                name: 'Unmatched Candidate',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
                ; (fusionService as any).fusionAccountMap.set('source-a-id::native-prev-unmatched-cap', unmatchedCandidate)
                ; (fusionService as any).currentRunUnmatchedFusionNativeIdentities.add(
                    'source-a-id::native-prev-unmatched-cap'
                )

            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            mockScoring.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
                const n = Array.from(_candidates).length
                if (candidateType === 'new-unmatched') {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Unmatched Candidate',
                        candidateType: 'new-unmatched',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true } as any],
                    } as any)
                }
                return n
            })

            await fusionService.analyzeManagedAccount(mockManagedAccount)
            const report = fusionService.generateReport(true)
            expect(
                report.accounts.some((a) => a.deferred && a.accountId === 'source-a-id::native-no-report-cap')
            ).toBe(false)
        })

        it('records deferred match report rows for custom:dryrun even when commandType is StdAccountList and fusionReportOnAggregation is false', async () => {
            const customReportFusion = new FusionService(
                mockConfig,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockAttributes,
                mockScoring,
                mockSchemas,
                StandardCommand.StdAccountList,
                'custom:dryrun'
            )

            const mockManagedAccount = {
                id: 'acct-custom-report-def',
                nativeIdentity: 'native-custom-report-def',
                name: 'Custom Report Deferred',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account

                ; (customReportFusion as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })

            const unmatchedCandidate = FusionAccount.fromManagedAccount({
                id: 'acct-prev-unmatched-cr',
                nativeIdentity: 'native-prev-unmatched-cr',
                name: 'Unmatched Candidate CR',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as any)
                ; (customReportFusion as any).fusionAccountMap.set('source-a-id::native-prev-unmatched-cr', unmatchedCandidate)
                ; (customReportFusion as any).currentRunUnmatchedFusionNativeIdentities.add(
                    'source-a-id::native-prev-unmatched-cr'
                )

            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            mockScoring.scoreFusionAccount.mockImplementation(async (account, _candidates, candidateType) => {
                const n = Array.from(_candidates).length
                if (candidateType === 'new-unmatched') {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'Unmatched Candidate CR',
                        candidateType: 'new-unmatched',
                        scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true } as any],
                    } as any)
                }
                return n
            })

            await customReportFusion.analyzeManagedAccount(mockManagedAccount)
            const report = customReportFusion.generateReport(true)
            expect(
                report.accounts.some((a) => a.deferred && a.accountId === 'source-a-id::native-custom-report-def')
            ).toBe(true)
        })

        it('records only unmatched history when creating a new authoritative non-match fusion account', async () => {
            const mockManagedAccount = {
                id: 'acct-unmatched-1',
                nativeIdentity: 'NE00002',
                name: 'Matt Usalen NE00002 Assignment00002',
                sourceId: 'src-nerm',
                sourceName: 'NERM',
                attributes: {},
            } as Account

                ; (fusionService as any).sourcesByName.set('NERM', {
                    id: 'src-nerm',
                    name: 'NERM',
                    sourceType: 'authoritative',
                    config: {},
                })
            const analyzed = FusionAccount.fromManagedAccount(mockManagedAccount)
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.history.some((h) => h.includes('as NonMatched'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account'))).toBe(false)
        })

        it('removes perfect automatically assigned accounts from manual-review report list', async () => {
            ; (fusionService as any).config.fusionMergingExactMatch = true
            const account = {
                id: 'acct-perfect-1',
                nativeIdentity: 'acct-perfect-1',
                name: 'Perfect User',
                sourceId: 'src-lh2',
                sourceName: 'LH2',
                attributes: {},
            } as Account

            const analyzed = FusionAccount.fromManagedAccount(account)
            analyzed.addFusionMatch({
                identityId: 'identity-perfect-1',
                identityName: 'Perfect Identity',
                scores: [
                    { attribute: 'firstname', algorithm: 'name', score: 100, fusionScore: '100' } as any,
                    { attribute: 'lastname', algorithm: 'name', score: 100, fusionScore: '100' } as any,
                ],
            } as any)
                ; (fusionService as any).matchAccounts = [analyzed]
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)
            jest.spyOn(fusionService, 'processFusionIdentityDecision').mockResolvedValue(analyzed)

            await fusionService.processManagedAccount(account)

            expect((fusionService as any).matchAccounts).toHaveLength(0)
        })

        it('registers synthetic automatic-assignment decisions for reporting', async () => {
            ; (fusionService as any).config.fusionMergingExactMatch = true
            const account = {
                id: 'acct-perfect-report-1',
                nativeIdentity: 'acct-perfect-report-1',
                name: 'Perfect Report User',
                sourceId: 'src-lh2',
                sourceName: 'LH2',
                attributes: {},
            } as Account

            const analyzed = FusionAccount.fromManagedAccount(account)
            analyzed.addFusionMatch({
                identityId: 'identity-perfect-report-1',
                identityName: 'Perfect Report Identity',
                scores: [
                    { attribute: 'firstname', algorithm: 'name', score: 100, fusionScore: '100' } as any,
                    { attribute: 'lastname', algorithm: 'name', score: 100, fusionScore: '100' } as any,
                ],
            } as any)
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)
            jest.spyOn(fusionService, 'processFusionIdentityDecision').mockResolvedValue(analyzed)

            await fusionService.processManagedAccount(account)

            expect(mockForms.registerFinishedDecision).toHaveBeenCalledTimes(1)
            expect(mockForms.registerFinishedDecision).toHaveBeenCalledWith(
                expect.objectContaining({
                    newIdentity: false,
                    identityId: 'identity-perfect-report-1',
                    comments: 'Automatically assigned: exact attribute match (all rules 100, none skipped)',
                    automaticAssignment: true,
                })
            )
        })

        it('does not assign automatically when a rule was skipped (missing)', async () => {
            ; (fusionService as any).config.fusionMergingExactMatch = true
                ; (fusionService as any).sourcesByName.set('LH2', {
                    id: 'src-lh2',
                    name: 'LH2',
                    sourceType: 'authoritative',
                    config: {},
                })
            const reviewer = FusionAccount.fromIdentity({ id: 'rev-skip-1', name: 'Rev', attributes: {} } as any)
            fusionService.reviewersBySourceId.set('src-lh2', new Set([reviewer]))

            const account = {
                id: 'acct-perfect-skip-1',
                nativeIdentity: 'acct-perfect-skip-1',
                name: 'Skipped Rule User',
                sourceId: 'src-lh2',
                sourceName: 'LH2',
                attributes: {},
            } as Account

            const analyzed = FusionAccount.fromManagedAccount(account)
            analyzed.addFusionMatch({
                identityId: 'identity-perfect-skip-1',
                identityName: 'Perfect Skip Identity',
                scores: [
                    { attribute: 'firstname', algorithm: 'name', score: 100 } as any,
                    { attribute: 'email', algorithm: 'jaro-winkler', score: 0, skipped: true } as any,
                ],
            } as any)
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)

            await fusionService.processManagedAccount(account)

            expect(mockForms.registerFinishedDecision).not.toHaveBeenCalled()
        })

        it('does not create fusion review forms when commandType is not StdAccountList', async () => {
            const analysisFusion = new FusionService(
                mockConfig,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockAttributes,
                mockScoring,
                mockSchemas,
                undefined
            )
            const reviewer = FusionAccount.fromIdentity({ id: 'rev-1', name: 'Rev', attributes: {} } as any)
            analysisFusion.reviewersBySourceId.set('source-a-id', new Set([reviewer]))
                ; (analysisFusion as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })

            const account = {
                id: 'acct-partial-1',
                nativeIdentity: 'native-partial-1',
                name: 'Partial User',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account
            const analyzed = FusionAccount.fromManagedAccount(account)
            analyzed.addFusionMatch({
                identityId: 'identity-partial-1',
                identityName: 'Partial Identity',
                candidateType: 'identity',
                scores: [{ attribute: 'name', algorithm: 'jaro-winkler', score: 95, isMatch: true } as any],
            } as any)
            mockForms.createFusionForm.mockResolvedValue(true)
            jest.spyOn(analysisFusion, 'analyzeManagedAccount').mockResolvedValue(analyzed)

            const result = await analysisFusion.processManagedAccount(account)

            expect(mockForms.createFusionForm).not.toHaveBeenCalled()
            expect(result).toBeUndefined()
        })

        it('does not apply automatic assignment for perfect scores when commandType is not StdAccountList', async () => {
            const cfg = { ...mockConfig, fusionMergingExactMatch: true } as unknown as FusionConfig
            const analysisFusion = new FusionService(
                cfg,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockAttributes,
                mockScoring,
                mockSchemas,
                undefined
            )
                ; (analysisFusion as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })

            const account = {
                id: 'acct-perfect-analysis-1',
                nativeIdentity: 'acct-perfect-analysis-1',
                name: 'Perfect Analysis User',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account
            const analyzed = FusionAccount.fromManagedAccount(account)
            analyzed.addFusionMatch({
                identityId: 'identity-perfect-analysis-1',
                identityName: 'Perfect Analysis Identity',
                scores: [
                    { attribute: 'firstname', algorithm: 'name', score: 100, fusionScore: '100' } as any,
                    { attribute: 'lastname', algorithm: 'name', score: 100, fusionScore: '100' } as any,
                ],
            } as any)
            jest.spyOn(analysisFusion, 'analyzeManagedAccount').mockResolvedValue(analyzed)
            const processDecision = jest.spyOn(analysisFusion, 'processFusionIdentityDecision').mockResolvedValue(analyzed)

            await analysisFusion.processManagedAccount(account)

            expect(mockForms.registerFinishedDecision).not.toHaveBeenCalled()
            expect(processDecision).not.toHaveBeenCalled()
        })

        it('does not fire disable for orphan non-matches when commandType is not StdAccountList', async () => {
            const analysisFusion = new FusionService(
                mockConfig,
                mockLog,
                mockIdentities,
                mockSources,
                mockForms,
                mockAttributes,
                mockScoring,
                mockSchemas,
                undefined
            )
                ; (analysisFusion as any).sourcesByName.set('OrphanSrc', {
                    id: 'orphan-src-id',
                    name: 'OrphanSrc',
                    sourceType: 'orphan',
                    config: { disableNonMatchingAccounts: true },
                })
            const reviewer = FusionAccount.fromIdentity({ id: 'rev-1', name: 'Rev', attributes: {} } as any)
            analysisFusion.reviewersBySourceId.set('orphan-src-id', new Set([reviewer]))

            const account = {
                id: 'acct-orphan-analysis-1',
                nativeIdentity: 'native-orphan-a1',
                name: 'Orphan User',
                sourceId: 'orphan-src-id',
                sourceName: 'OrphanSrc',
                attributes: {},
            } as Account
            const analyzed = FusionAccount.fromManagedAccount(account)
            jest.spyOn(analysisFusion, 'analyzeManagedAccount').mockResolvedValue(analyzed)
            jest.spyOn(mockSources, 'fireDisableAccount').mockResolvedValue(undefined)

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
            } as Account

            const managedAccountsMap = new Map<string, Account>()
            managedAccountsMap.set('source-a-id::mgmt-1', mockManagedAccount)

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedAccountsMap)

            // Mock scoring
            mockScoring.scoreFusionAccount.mockImplementation(async (_account, candidates) => Array.from(candidates).length)

            await fusionService.processManagedAccounts()

            // Verify log called or side effects
            expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Processing 1 managed account'))
        })

        it('should set reverse correlation attribute for first-run unmatched authoritative accounts', async () => {
            const mockManagedAccount = {
                id: 'acct-1',
                nativeIdentity: 'native-1',
                name: 'Managed Account 1',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account

            const analyzed = FusionAccount.fromManagedAccount(mockManagedAccount)
                ; (fusionService as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)
            mockSources.getSourceConfig.mockReturnValue({
                name: 'Source A',
                correlationMode: 'reverse',
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            } as any)

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.attributes.reverseNativeIdentity).toBe('native-1')
            expect(mockSources.assertReverseCorrelationReady).toHaveBeenCalledTimes(1)
        })

        it('should hydrate missing account info during managed-account layer for historical missing accounts', async () => {
            const historicalAccount = {
                nativeIdentity: 'fusion-1',
                identityId: 'identity-1',
                name: 'Fusion Account',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {
                    accounts: ['source-a-id::native-missing-1'],
                },
            } as unknown as Account

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([
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
            mockSources.getSourceConfig.mockImplementation((sourceName: string) => {
                if (sourceName === 'Source A') {
                    return {
                        name: 'Source A',
                        correlationMode: 'reverse',
                        correlationAttribute: 'reverseNativeIdentity',
                        correlationDisplayName: 'Reverse Native Identity',
                    } as any
                }
                return undefined
            })
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

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

            jest.spyOn(mockIdentities, 'getIdentityById').mockReturnValue({
                id: 'identity-1',
                name: 'Jane Doe',
                attributes: { displayName: 'Jane Q. Doe' },
            } as IdentityDocument)
            jest.spyOn(mockForms, 'getFusionAssignmentDecision').mockReturnValue(undefined)

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map())
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.name).toBe('Jane Q. Doe')
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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
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
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(
                new Map([['identity-1', new Set(['source-a-id::native-new-2'])]])
            )
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
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
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.accountIds).toContain('source-a-id::native-new-2')
            expect(result.history).toEqual(
                expect.arrayContaining([expect.stringContaining('Associated managed account Managed Account New [Source A]')])
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
                    accounts: ['source-a-id::native-existing-1', 'source-a-id::native-deleted-1'],
                },
            } as unknown as Account

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
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
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
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
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

            const result = await fusionService.processFusionAccount(historicalAccount)

            expect(result.accountIds).toContain('source-a-id::native-existing-1')
            expect(result.accountIds).not.toContain('source-a-id::native-deleted-1')
            expect(result.missingAccountIds).toContain('source-a-id::native-existing-1')
            expect(result.missingAccountIds).not.toContain('source-a-id::native-deleted-1')
            expect(result.needsRefresh).toBe(true)
            expect(result.history).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('Removed deleted managed account reference: source-a-id::native-deleted-1'),
                ])
            )
        })

        it('should not clear reverse attribute when missing account source info is unresolved', async () => {
            ; (fusionService as any).config.sources = [
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

            await (fusionService as any).correlatePerSource(fusionAccount)

            expect(fusionAccount.attributes.reverseNativeIdentity).toBe('existing-value')
        })

        it('direct-correlates link-decision assigned account when managed metadata is absent but source is correlate', async () => {
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            jest.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
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

            await (fusionService as any).correlatePerSource(fusionAccount, linkDecision)

            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(fusionAccount, [
                'source-a-id::native-no-meta',
            ])
        })

        it('fails managed account processing when reverse correlation prerequisites are missing', async () => {
            const mockManagedAccount = {
                id: 'acct-2',
                nativeIdentity: 'native-2',
                name: 'Managed Account 2',
                sourceId: 'source-a-id',
                sourceName: 'Source A',
                attributes: {},
            } as Account

            const analyzed = FusionAccount.fromManagedAccount(mockManagedAccount)
                ; (fusionService as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)
            mockSources.getSourceConfig.mockReturnValue({
                name: 'Source A',
                correlationMode: 'reverse',
                correlationAttribute: 'reverseNativeIdentity',
                correlationDisplayName: 'Reverse Native Identity',
            } as any)
            mockSources.assertReverseCorrelationReady.mockRejectedValueOnce(
                new Error('Reverse correlation prerequisites are not ready')
            )

            await expect(fusionService.processManagedAccount(mockManagedAccount)).rejects.toThrow(
                'Reverse correlation prerequisites are not ready'
            )
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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
                new Map([
                    ['source-a-id::native-analyze-1', firstAccount],
                    ['source-a-id::native-analyze-2', secondAccount],
                ])
            )
                ; (fusionService as any).sourcesByName.set('Source A', {
                    id: 'source-a-id',
                    name: 'Source A',
                    sourceType: 'authoritative',
                    config: {},
                })
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            mockScoring.scoreFusionAccount.mockImplementation(async (account, candidates, candidateType) => {
                const candidateList = Array.from(candidates)
                if (candidateType !== 'new-unmatched') return candidateList.length
                if (candidateList.length > 0) {
                    account.addFusionMatch({
                        identityId: '',
                        identityName: 'A. Wesker',
                        candidateType: 'new-unmatched',
                        scores: [{ attribute: 'lastname', algorithm: 'jaro-winkler', score: 100, isMatch: true } as any],
                    } as any)
                }
                return candidateList.length
            })

            const analyzed = await fusionService.analyzeUncorrelatedAccounts()

            expect(analyzed).toHaveLength(2)
            expect(analyzed[1].fusionMatches.some((match) => match.candidateType === 'new-unmatched')).toBe(true)
            expect(mockLog.info).toHaveBeenCalledWith(expect.stringMatching(/DEFERRED .*MATCH FOUND/))
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
            const inAccountMap = fusionService.getFusionAccountByNativeIdentity('fusion-uncorr-1')
            expect(inIdentityMap).toBe(account)
            expect(inAccountMap).toBeUndefined()
        })

        it('routes fusion account without identityId to fusionAccountMap', () => {
            const account = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-noident-1',
                name: 'Unmatched Account',
                sourceName: 'Identity Fusion NG',
                uncorrelated: true,
                attributes: {},
            } as unknown as Account)

            fusionService.setFusionAccount(account)

            const inAccountMap = fusionService.getFusionAccountByNativeIdentity('fusion-noident-1')
            expect(inAccountMap).toBe(account)
        })
    })

    describe('identity conflict warnings', () => {
        it('logs warning and includes identity conflict details in report', () => {
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
                expect.stringContaining(
                    'More than one Fusion account was found for identity identity-duplicate'
                )
            )

            const report = fusionService.generateReport()
            const conflictWarnings = report.warnings?.identityConflicts

            expect(conflictWarnings?.affectedIdentities).toBe(1)
            expect(conflictWarnings?.occurrences).toHaveLength(1)
            expect(conflictWarnings?.occurrences[0].identityId).toBe('identity-duplicate')
            expect(conflictWarnings?.occurrences[0].accountCount).toBe(2)
            expect(conflictWarnings?.occurrences[0].nativeIdentities).toEqual(['fusion-a', 'fusion-b'])
        })

        it('does not warn when the same correlated account key is updated', () => {
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

            const report = fusionService.generateReport()
            expect(report.warnings).toBeUndefined()
        })

        it('clears identity conflict warning payload after report generation', () => {
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

            const firstReport = fusionService.generateReport()
            expect(firstReport.warnings?.identityConflicts?.affectedIdentities).toBe(1)

            const secondReport = fusionService.generateReport()
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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map([[managedKey, managedAccount]]))
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            jest.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([[managedKeyAuto, managedAccount]])
            )
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            jest.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
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
            expect(result?.history.some((h) => h.includes('Auto-assigned LH2 User [LH2] to existing identity'))).toBe(true)
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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([[managedKeyAutoCorr, managedAccount]])
            )
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            jest.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
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
            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(
                expect.any(FusionAccount),
                [managedKeyAutoCorr]
            )
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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([[managedKeyNoId, managedAccount]])
            )
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([[managedKeyAuthz, managedAccount]])
            )
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(undefined as any)
            mockIdentities.fetchIdentityById.mockResolvedValue({
                id: 'identity-1',
                name: 'Identity One',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument)
            mockIdentities.correlateAccounts.mockResolvedValue(true)
            jest.spyOn(mockSources, 'getSourceConfig').mockReturnValue({
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
            const managedMap = new Map<string, Account>()
            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map())
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockAttributes.registerUniqueAttributes.mockResolvedValue()

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: 'src-record-src::record-native-1',
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
            expect(mockAttributes.registerUniqueAttributes).toHaveBeenCalledTimes(1)
        })

        it('safely skips orphan disable queue when account is no longer in managed map', async () => {
            const managedAccount = {
                id: 'acct-orphan-1',
                name: 'Orphan User',
                sourceId: 'src-orphan-1',
                nativeIdentity: 'orphan-native-1',
                sourceName: 'Orphan Source',
                attributes: {},
            } as Account
            const managedKeyOrphan = 'src-orphan-1::orphan-native-1'
            const managedMap = new Map<string, Account>([[managedKeyOrphan, managedAccount]])

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map())
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

                ; (fusionService as any).sourcesByName.set('Orphan Source', {
                    id: 'src-orphan-1',
                    name: 'Orphan Source',
                    sourceType: 'orphan',
                    config: { disableNonMatchingAccounts: true },
                })

            const queueDisableSpy = jest.spyOn(fusionService as any, 'queueDisableOperation').mockImplementation(() => { })
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
            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map())
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            const setFusionAccountSpy = jest.spyOn(fusionService, 'setFusionAccount')
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

            fusionAccount.addStatus('candidate', 'Set candidate status')
            fusionAccount.addStatus('candidate', 'Set candidate status')

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

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map([[histKey, managedAccount]]))
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            const decision = {
                submitter: { id: 'reviewer-1', email: ' ', name: ' ' },
                account: { id: histKey, name: '  ', sourceName: '  ', sourceId: 'src-lh2', nativeIdentity: 'hist-fallback' },
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
})
