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
})
