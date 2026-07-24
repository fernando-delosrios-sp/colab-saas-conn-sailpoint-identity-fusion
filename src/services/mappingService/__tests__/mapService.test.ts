import { MappingService } from '../mappingService'
import { FusionRun } from '../../../model/fusionRun'
import { FusionAccount } from '../../../model/account'
import { FusionAccountKind } from '../../../model/fusionAccountTypes'

describe('MappingService selective targets', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const config = {
        attributeMaps: [
            { newAttribute: 'employeeId', existingAttributes: ['emp_id'] },
            { newAttribute: 'displayName', existingAttributes: ['name'] },
        ],
        attributeMerge: 'first' as const,
        sources: [{ name: 'Record Source' }],
        fusionAccountRefreshThresholdInSeconds: 3600,
        maxHistoryMessages: 50,
        reset: false,
    } as any

    beforeAll(() => {
        FusionAccount.configure(config)
    })

    function buildManagedAccount(): FusionAccount {
        const account = {
            id: 'src-1::native-1',
            name: 'User One',
            sourceId: 'src-1',
            nativeIdentity: 'native-1',
            sourceName: 'Record Source',
            attributes: {
                emp_id: 'E123',
                name: 'User One',
                email: 'user@example.com',
            },
            uncorrelated: true,
        } as any
        return FusionAccount.fromManagedAccount(account)
    }

    it('maps only requested targets when onlyTargets is set', () => {
        const service = new MappingService(config, mockLog)
        const run = new FusionRun()
        const fusionAccount = buildManagedAccount()

        service.mapAttributes(fusionAccount, run, { onlyTargets: new Set(['employeeId']) })

        expect(fusionAccount.attributes.employeeId).toBe('E123')
        expect(fusionAccount.attributes.displayName).toBeUndefined()
        expect(fusionAccount.attributes.email).toBe('user@example.com')
    })

    it('maps all configured targets when onlyTargets is omitted', () => {
        const service = new MappingService(config, mockLog)
        const run = new FusionRun()
        const fusionAccount = buildManagedAccount()

        service.mapAttributes(fusionAccount, run)

        expect(fusionAccount.attributes.employeeId).toBe('E123')
        expect(fusionAccount.attributes.displayName).toBe('User One')
    })

    it('skips identity-type accounts', () => {
        const service = new MappingService(config, mockLog)
        const run = new FusionRun()
        const account = { type: FusionAccountKind.Identity, attributeBag: { current: {} } } as FusionAccount
        service.mapAttributes(account, run, { onlyTargets: new Set(['employeeId']) })
    })
})
