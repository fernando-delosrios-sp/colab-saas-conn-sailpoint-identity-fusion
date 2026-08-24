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
        managedAccountsBatchSize: 12,
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

    it('registerUniqueValuesFromRecordManagedAccounts registers 25 distinct values with batch size 12', async () => {
        const definitionService = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const mappingService = new MappingService(config, mockLog)
        const run = new FusionRun()
        const accounts = Array.from({ length: 25 }, (_, index) =>
            managedAccount({
                id: `src-record::native-${index}`,
                nativeIdentity: `native-${index}`,
                attributes: { emp_id: `E${String(index).padStart(3, '0')}` },
            })
        )

        const processedAtBatchEnd: number[] = []
        await definitionService.registerUniqueValuesFromRecordManagedAccounts(accounts, mappingService, run, {
            onProgress: (processed) => processedAtBatchEnd.push(processed),
        })

        const registered = (definitionService as any).getUniqueValues('employeeId') as Set<string>
        expect(registered.size).toBe(25)
        for (let index = 0; index < 25; index++) {
            expect(registered.has(`E${String(index).padStart(3, '0')}`)).toBe(true)
        }
        expect(processedAtBatchEnd).toEqual([12, 24, 25])
    })

    it('registerUniqueValuesFromRecordManagedAccounts skips missing unique values without error', async () => {
        const definitionService = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const mappingService = new MappingService(config, mockLog)
        const run = new FusionRun()

        await definitionService.registerUniqueValuesFromRecordManagedAccounts(
            [
                managedAccount({
                    id: 'src-record::native-missing-email',
                    nativeIdentity: 'native-missing-email',
                    attributes: { emp_id: 'E-MISS' },
                }),
                managedAccount({
                    id: 'src-record::native-both',
                    nativeIdentity: 'native-both',
                    attributes: { emp_id: 'E-BOTH', email: 'both@example.com' },
                }),
            ],
            mappingService,
            run
        )

        expect((definitionService as any).getUniqueValues('employeeId').has('E-MISS')).toBe(true)
        expect((definitionService as any).getUniqueValues('employeeId').has('E-BOTH')).toBe(true)
        expect((definitionService as any).getUniqueValues('email').has('both@example.com')).toBe(true)
        expect((definitionService as any).getUniqueValues('email').size).toBe(1)
    })

    it('registers distinct values for the same unique attribute name from two accounts', async () => {
        const definitionService = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const mappingService = new MappingService(config, mockLog)
        const run = new FusionRun()

        await definitionService.registerUniqueValuesFromRecordManagedAccounts(
            [
                managedAccount({
                    id: 'src-record::native-a',
                    nativeIdentity: 'native-a',
                    attributes: { emp_id: 'E-A' },
                }),
                managedAccount({
                    id: 'src-record::native-b',
                    nativeIdentity: 'native-b',
                    attributes: { emp_id: 'E-B' },
                }),
            ],
            mappingService,
            run
        )

        const registered = (definitionService as any).getUniqueValues('employeeId') as Set<string>
        expect(registered.has('E-A')).toBe(true)
        expect(registered.has('E-B')).toBe(true)
        expect(registered.size).toBe(2)
    })
})

