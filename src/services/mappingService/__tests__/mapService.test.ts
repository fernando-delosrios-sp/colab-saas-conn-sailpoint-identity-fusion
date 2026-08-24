import { MappingService } from '../mappingService'
import { FusionRun } from '../../../model/fusionRun'
import { FusionAccount } from '../../../model/account'
import { FusionAccountKind } from '../../../model/fusionAccountTypes'
import { AttributeMergeMode } from '../../../model/config'
import { FusionAttribute } from '../../../data/schema'

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
        resetAccounts: false,
        resetForms: false,
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

    it('pins Origin account merge to originAccount rather than the first account on its source', () => {
        const originConfig = {
            ...config,
            attributeMaps: [
                {
                    newAttribute: 'email',
                    existingAttributes: ['email'],
                    attributeMerge: AttributeMergeMode.OriginAccount,
                },
            ],
            sources: [{ name: 'Record Source' }],
        } as any
        const service = new MappingService(originConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'other',
                email: 'other@example.com',
            },
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                email: 'origin@example.com',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributes.email).toBe('origin@example.com')
    })

    it('uses the identity bag as origin snapshot for an identity-origin Fusion account', () => {
        const originConfig = {
            ...config,
            attributeMaps: [
                {
                    newAttribute: 'department',
                    existingAttributes: ['department'],
                    attributeMerge: AttributeMergeMode.OriginAccount,
                },
            ],
            sources: [{ name: 'Record Source' }],
        } as any
        const service = new MappingService(originConfig, mockLog)
        const fusionAccount = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-1',
            name: 'Fusion One',
            sourceName: 'Identity Fusion',
            identityId: 'identity-1',
            attributes: {
                originSource: 'Identities',
                originAccount: 'identity-1',
                statuses: ['baseline'],
            },
        } as any)
        fusionAccount.addIdentityLayer({
            id: 'identity-1',
            name: 'identity-one',
            attributes: { department: 'HR' },
        } as any)
        fusionAccount.attributeBag.sources.set('Record Source', [{ department: 'IT' }])
        fusionAccount.setNeedsRefresh(true)

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributes.department).toBe('HR')
    })

    it('uses the mainAccount snapshot for Main account merge when that key is found', () => {
        const mainConfig = {
            ...config,
            attributeMaps: [
                {
                    newAttribute: 'jobTitle',
                    existingAttributes: ['jobTitle'],
                    attributeMerge: AttributeMergeMode.MainAccount,
                },
            ],
        } as any
        const service = new MappingService(mainConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                jobTitle: 'Engineer',
            },
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-2',
                jobTitle: 'Manager',
            },
        ])
        fusionAccount.attributeBag.current[FusionAttribute.MainAccount] = 'src-1::native-2'

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributes.jobTitle).toBe('Manager')
    })

    it('uses the origin snapshot for Main account merge when mainAccount is unset', () => {
        const mainConfig = {
            ...config,
            attributeMaps: [
                {
                    newAttribute: 'jobTitle',
                    existingAttributes: ['jobTitle'],
                    attributeMerge: AttributeMergeMode.MainAccount,
                },
            ],
        } as any
        const service = new MappingService(mainConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                jobTitle: 'Engineer',
            },
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-2',
                jobTitle: 'Manager',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributes.jobTitle).toBe('Engineer')
    })

    it('does not replace current bag object when needsRefresh is false and history is empty', () => {
        const service = new MappingService(config, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.setNeedsRefresh(false)
        fusionAccount.attributeBag.current.displayName = 'Kept'
        const before = fusionAccount.attributeBag.current

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.displayName).toBe('Kept')
        expect(fusionAccount.attributeBag.current).toBe(before)
    })

    it('uses rewritten mainAccount from the same invocation index for Main account merge', () => {
        const rewriteConfig = {
            ...config,
            attributeMaps: [
                {
                    newAttribute: 'mainAccount',
                    existingAttributes: ['mainAccount'],
                    attributeMerge: AttributeMergeMode.First,
                },
                {
                    newAttribute: 'jobTitle',
                    existingAttributes: ['jobTitle'],
                    attributeMerge: AttributeMergeMode.MainAccount,
                },
            ],
        } as any
        const service = new MappingService(rewriteConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.setNeedsRefresh(true)
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                mainAccount: 'src-1::native-2',
                jobTitle: 'Engineer',
            },
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-2',
                jobTitle: 'Manager',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributes.jobTitle).toBe('Manager')
    })
})
