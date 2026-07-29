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
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { hasValue, trimStr } from '../../../utils/safeRead'

vi.mock('../../logService')
vi.mock('../../identityService')
vi.mock('../../sourceService')
vi.mock('../../formService')
vi.mock('../../mappingService')
vi.mock('../../definitionService')
vi.mock('../../matchingService')
vi.mock('../../schemaService')

export function seedRunInventory(run: FusionRun, accounts: Map<string, Account>): void {
    run.managedAccountInventory.clear()
    for (const [key, account] of accounts.entries()) {
        run.managedAccountInventory.set(key, toManagedAccountInfo(account))
    }
}

export interface FusionServiceTestContext {
    FUSION_SOURCE_ID: string
    fusionService: FusionService
    run: FusionRun
    mockLog: Mocked<LogService>
    mockIdentities: Mocked<IdentityService>
    mockSources: Mocked<SourceService>
    mockForms: Mocked<FormService>
    mockMappingService: Mocked<MappingService>
    mockDefinitionService: Mocked<DefinitionService>
    mockMatchingService: Mocked<MatchingService>
    mockSchemas: Mocked<SchemaService>
    mockConfig: FusionConfig
    createDispatcherFor: (fusionService: FusionService) => MatchOutcomeDispatcher
}

export function createFusionServiceTestContext(): FusionServiceTestContext {
    const FUSION_SOURCE_ID = 'fusion-src'
    const run = new FusionRun()

    const mockConfig = {
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

    const mockLog = new LogService({ spConnDebugLoggingEnabled: false }) as Mocked<LogService>
    run.log = mockLog
    const mockClient = {} as any
    const mockSources = new SourceService(mockConfig, mockLog, mockClient, run) as Mocked<SourceService>
    ;(mockSources as any)._fusionSourceId = FUSION_SOURCE_ID
    Object.defineProperty(mockSources, 'fusionSourceId', {
        get: vi.fn(() => FUSION_SOURCE_ID),
        configurable: true,
    })
    const mockIdentities = new IdentityService(
        mockConfig,
        mockLog,
        mockClient,
        mockSources,
        run
    ) as Mocked<IdentityService>
    const mockForms = new FormService(
        mockConfig,
        mockLog,
        mockClient,
        mockSources,
        mockIdentities,
        undefined,
        run
    ) as Mocked<FormService>
    const mockLocks = {} as any
    const mockSchemas = new SchemaService(mockConfig, mockLog, mockSources, mockClient) as Mocked<SchemaService>
    const mockMappingService = new MappingService(mockConfig, mockLog) as Mocked<MappingService>
    const mockDefinitionService = new DefinitionService(
        mockConfig,
        mockSchemas,
        mockLog,
        mockLocks
    ) as Mocked<DefinitionService>
    const mockMatchingService = new MatchingService(mockConfig, mockLog) as Mocked<MatchingService>

    Object.defineProperty(mockSources, 'managedAccountsById', {
        get: vi.fn(() => new Map()),
        configurable: true,
    })
    Object.defineProperty(mockSources, 'managedAccountsByIdentityId', {
        get: vi.fn(() => new Map()),
        configurable: true,
    })
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
            (run.getManagedAccountInfo(managedKey) ? { id: run.getManagedAccountInfo(managedKey)!.id } : undefined)
        const raw = acc?.id
        if (hasValue(raw)) return trimStr(raw) ?? ''
        if (!managedKey.includes('::')) return managedKey
        return undefined
    })

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
        })
    }

    const fusionService = new FusionService(
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

    return {
        FUSION_SOURCE_ID,
        fusionService,
        run,
        mockLog,
        mockIdentities,
        mockSources,
        mockForms,
        mockMappingService,
        mockDefinitionService,
        mockMatchingService,
        mockSchemas,
        mockConfig,
        createDispatcherFor,
    }
}
