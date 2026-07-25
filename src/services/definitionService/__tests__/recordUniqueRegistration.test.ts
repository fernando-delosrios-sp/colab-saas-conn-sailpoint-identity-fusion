import { DefinitionService } from '../definitionService'
import { MappingService } from '../../mappingService'
import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'

describe('DefinitionService record unique registration', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any

    const config = {
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [{ name: 'employeeId' }, { name: 'email' }],
        attributeMaps: [{ newAttribute: 'employeeId', existingAttributes: ['emp_id'] }],
        sources: [{ name: 'Record Source', id: 'src-record', type: 'record' }],
        fusionAccountRefreshThresholdInSeconds: 3600,
        maxHistoryMessages: 50,
        resetAccounts: false,
        resetForms: false,
    } as unknown as FusionConfig

    beforeAll(() => {
        FusionAccount.configure(config)
    })

    function managedAccount(overrides: Record<string, unknown> = {}) {
        return {
            id: 'src-record::native-1',
            name: 'Record User',
            sourceId: 'src-record',
            nativeIdentity: 'native-1',
            sourceName: 'Record Source',
            attributes: {
                emp_id: 'E123',
                email: 'user@example.com',
            },
            uncorrelated: true,
            ...overrides,
        } as any
    }

    it('registers mapped and passthrough unique values', async () => {
        const definitionService = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const mappingService = new MappingService(config, mockLog)
        const run = new FusionRun()

        await definitionService.registerUniqueValuesFromRecordManagedAccount(
            managedAccount(),
            mappingService,
            run
        )

        expect((definitionService as any).getUniqueValues('employeeId').has('E123')).toBe(true)
        expect((definitionService as any).getUniqueValues('email').has('user@example.com')).toBe(true)
    })

    it('skips missing unique values without error', async () => {
        const definitionService = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const mappingService = new MappingService(config, mockLog)
        const run = new FusionRun()

        await definitionService.registerUniqueValuesFromRecordManagedAccount(
            managedAccount({ attributes: { emp_id: 'E999' } }),
            mappingService,
            run
        )

        expect((definitionService as any).getUniqueValues('employeeId').has('E999')).toBe(true)
        expect((definitionService as any).getUniqueValues('email').size).toBe(0)
    })
})

