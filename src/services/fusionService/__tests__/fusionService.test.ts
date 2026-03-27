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
        mockIdentities = new IdentityService(mockConfig, mockLog, mockClient) as jest.Mocked<IdentityService>
        mockSources = new SourceService(mockConfig, mockLog, mockClient) as jest.Mocked<SourceService>
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
            expect(fusionAccount.accountDisplayName).toBe('fusion-identity-1')
            expect((fusionAccount.attributeBag.identity as any).name).toBe('Jane Identity (from ref)')
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

            // Pre-register the identity
            const fusionAccount = FusionAccount.fromIdentity(mockIdentity)
            // We need to access private map or use a public method to set it.
            // setFusionAccount is private in the class but logically we can simulate it by running processIdentity once

            await fusionService.processIdentity(mockIdentity)
            const result = await fusionService.processIdentity(mockIdentity)

            expect(result).toBeUndefined()
        })
    })

    describe('processManagedAccounts', () => {
        it('records only unmatched history when creating a new authoritative non-match fusion account', async () => {
            const mockManagedAccount = {
                id: 'acct-unmatched-1',
                nativeIdentity: 'NE00002',
                name: 'Matt Usalen NE00002 Assignment00002',
                sourceName: 'NERM',
                attributes: {},
            } as Account

            ;(fusionService as any).sourcesByName.set('NERM', {
                id: 'src-nerm',
                name: 'NERM',
                sourceType: 'authoritative',
                config: {},
            })
            const analyzed = FusionAccount.fromManagedAccount(mockManagedAccount)
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)

            const result = await fusionService.processManagedAccount(mockManagedAccount)

            expect(result).toBeDefined()
            expect(result?.history.some((h) => h.includes('as unmatched'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account'))).toBe(false)
        })

        it('removes perfect auto-correlated accounts from potential manual-review report list', async () => {
            ;(fusionService as any).config.fusionMergingIdentical = true
            const account = {
                id: 'acct-perfect-1',
                nativeIdentity: 'acct-perfect-1',
                name: 'Perfect User',
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
            ;(fusionService as any).potentialMatchAccounts = [analyzed]
            jest.spyOn(fusionService, 'analyzeManagedAccount').mockResolvedValue(analyzed)
            jest.spyOn(fusionService, 'processFusionIdentityDecision').mockResolvedValue(analyzed)

            await fusionService.processManagedAccount(account)

            expect((fusionService as any).potentialMatchAccounts).toHaveLength(0)
        })

        it('registers synthetic auto-correlation decisions for reporting', async () => {
            ;(fusionService as any).config.fusionMergingIdentical = true
            const account = {
                id: 'acct-perfect-report-1',
                nativeIdentity: 'acct-perfect-report-1',
                name: 'Perfect Report User',
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
                    comments: 'Auto-correlated: all attribute scores were 100',
                })
            )
        })

        it('should process managed accounts', async () => {
            const mockManagedAccount = {
                nativeIdentity: 'mgmt-1',
                name: 'Managed Account 1',
                sourceName: 'Source A',
            } as Account

            const managedAccountsMap = new Map<string, Account>()
            managedAccountsMap.set('mgmt-1', mockManagedAccount)

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedAccountsMap)

            // Mock scoring
            mockScoring.scoreFusionAccount.mockImplementation((account) => {
                // no-op or set matches
            })

            await fusionService.processManagedAccounts()

            // Verify log called or side effects
            expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Processing 1 managed account'))
        })

        it('should set reverse correlation attribute for first-run unmatched authoritative accounts', async () => {
            const mockManagedAccount = {
                id: 'acct-1',
                nativeIdentity: 'native-1',
                name: 'Managed Account 1',
                sourceName: 'Source A',
                attributes: {},
            } as Account

            const analyzed = FusionAccount.fromManagedAccount(mockManagedAccount)
            ;(fusionService as any).sourcesByName.set('Source A', {
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
                    accounts: ['acct-missing-1'],
                },
            } as unknown as Account

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([
                    [
                        'acct-missing-1',
                        {
                            id: 'acct-missing-1',
                            nativeIdentity: 'native-missing-1',
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

        it('writes history when a newly associated managed account is picked up for an identity', async () => {
            const historicalAccount = {
                nativeIdentity: 'fusion-identity-1',
                identityId: 'identity-1',
                name: 'Fusion Identity',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {
                    accounts: ['acct-existing-1'],
                },
            } as unknown as Account

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
                new Map([
                    [
                        'acct-new-2',
                        {
                            id: 'acct-new-2',
                            name: 'Managed Account New',
                            nativeIdentity: 'native-new-2',
                            sourceName: 'Source A',
                            identityId: 'identity-1',
                            attributes: {},
                        } as unknown as Account,
                    ],
                ])
            )
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(
                new Map([['identity-1', new Set(['acct-new-2'])]])
            )
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([
                    [
                        'acct-new-2',
                        {
                            id: 'acct-new-2',
                            name: 'Managed Account New',
                            nativeIdentity: 'native-new-2',
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

            expect(result.accountIds).toContain('acct-new-2')
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
                    accounts: ['acct-existing-1', 'acct-deleted-1'],
                },
            } as unknown as Account

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(
                new Map([
                    [
                        'acct-existing-1',
                        {
                            id: 'acct-existing-1',
                            nativeIdentity: 'native-existing-1',
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
                        'acct-existing-1',
                        {
                            id: 'acct-existing-1',
                            nativeIdentity: 'native-existing-1',
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

            expect(result.accountIds).toContain('acct-existing-1')
            expect(result.accountIds).not.toContain('acct-deleted-1')
            expect(result.missingAccountIds).toContain('acct-existing-1')
            expect(result.missingAccountIds).not.toContain('acct-deleted-1')
            expect(result.needsRefresh).toBe(true)
            expect(result.history).toEqual(
                expect.arrayContaining([expect.stringContaining('Removed deleted managed account reference: acct-deleted-1')])
            )
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

            await (fusionService as any).correlatePerSource(fusionAccount, false)

            expect(fusionAccount.attributes.reverseNativeIdentity).toBe('existing-value')
        })

        it('fails managed account processing when reverse correlation prerequisites are missing', async () => {
            const mockManagedAccount = {
                id: 'acct-2',
                nativeIdentity: 'native-2',
                name: 'Managed Account 2',
                sourceName: 'Source A',
                attributes: {},
            } as Account

            const analyzed = FusionAccount.fromManagedAccount(mockManagedAccount)
            ;(fusionService as any).sourcesByName.set('Source A', {
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
                expect.stringContaining('Multiple Fusion accounts detected for identity identity-duplicate')
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
            existingFusionAccount.setUnmatched()
            fusionService.setFusionAccount(existingFusionAccount)

            const managedAccount = {
                id: 'acct-authz-existing-1',
                name: 'LH2 User',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedMap = new Map<string, Account>([['acct-authz-existing-1', managedAccount]])

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(
                new Map([['acct-authz-existing-1', managedAccount]])
            )
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: { id: 'acct-authz-existing-1', name: 'LH2 User', sourceName: 'LH2' },
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
            expect(result?.statuses).not.toContain('unmatched')
            expect(result?.history.some((h) => h.includes('as authorized by Reviewer'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(existingFusionAccount, ['acct-authz-existing-1'])
            expect(fusionService.getFusionIdentity('identity-1')).toBe(existingFusionAccount)
        })

        it('writes auto-assignment history for system auto-correlation decisions', async () => {
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
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedMap = new Map<string, Account>([['acct-auto-1', managedAccount]])

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map([['acct-auto-1', managedAccount]]))
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()
            mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            mockIdentities.correlateAccounts.mockResolvedValue(true)

            const decision = {
                submitter: { id: 'system', email: '', name: 'System (auto-correlated)' },
                account: { id: 'acct-auto-1', name: 'LH2 User', sourceName: 'LH2' },
                newIdentity: false,
                identityId: 'identity-2',
                comments: 'Auto-correlated: all attribute scores were 100',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await fusionService.processFusionIdentityDecision(decision)
            expect(result?.history.some((h) => h.includes('Auto-assigned LH2 User [LH2] to existing identity'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
        })

        it('auto-correlates authorized decisions to the selected identity in the same run', async () => {
            const managedAccount = {
                id: 'acct-authz-1',
                name: 'Authorized User',
                sourceName: 'Authoritative Source',
                attributes: {},
            } as Account
            const managedMap = new Map<string, Account>([['acct-authz-1', managedAccount]])

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map([['acct-authz-1', managedAccount]]))
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

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: { id: 'acct-authz-1', name: 'Authorized User', sourceName: 'Authoritative Source' },
                newIdentity: false,
                identityId: 'identity-1',
                comments: 'Assign to existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            await fusionService.processFusionIdentityDecision(decision)

            expect(mockIdentities.correlateAccounts).toHaveBeenCalledTimes(1)
            expect(mockIdentities.correlateAccounts).toHaveBeenCalledWith(expect.any(FusionAccount), ['acct-authz-1'])
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
                account: { id: 'acct-record-1', name: 'Record User', sourceName: 'Record Source' },
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
                sourceName: 'Orphan Source',
                attributes: {},
            } as Account
            const managedMap = new Map<string, Account>([['acct-orphan-1', managedAccount]])

            jest.spyOn(mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            jest.spyOn(mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            jest.spyOn(mockSources, 'managedAccountsAllById', 'get').mockReturnValue(new Map())
            mockAttributes.mapAttributes.mockImplementation((account) => account)
            mockAttributes.refreshNormalAttributes.mockResolvedValue()

            ;(fusionService as any).sourcesByName.set('Orphan Source', {
                id: 'src-orphan-1',
                name: 'Orphan Source',
                sourceType: 'orphan',
                config: { disableNonMatchingAccounts: true },
            })

            const queueDisableSpy = jest.spyOn(fusionService as any, 'queueDisableOperation').mockImplementation(() => {})
            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: { id: 'acct-orphan-1', name: 'Orphan User', sourceName: 'Orphan Source' },
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
                account: { id: 'acct-auth-1', name: 'Auth User', sourceName: 'Authoritative Source' },
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
})
