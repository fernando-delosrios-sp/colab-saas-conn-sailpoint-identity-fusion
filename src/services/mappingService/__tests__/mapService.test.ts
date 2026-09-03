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
        const account = {
            type: FusionAccountKind.Identity,
            attributeBag: { current: {} },
            sources: [],
            history: [],
        } as unknown as FusionAccount
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

    it('Unmapped same-named key uses stored First found default', () => {
        const firstConfig = { ...config, attributeMaps: [], attributeMerge: AttributeMergeMode.First } as any
        const service = new MappingService(firstConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                department: 'First found',
            },
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-2',
                department: 'Second',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.department).toBe('First found')
    })

    it('Unmapped key uses Main account default', () => {
        const mainConfig = { ...config, attributeMaps: [], attributeMerge: AttributeMergeMode.MainAccount } as any
        const service = new MappingService(mainConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current[FusionAttribute.MainAccount] = 'src-1::native-2'
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                department: 'Origin',
            },
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-2',
                department: 'Main',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.department).toBe('Main')
    })

    it('Unmapped Main account miss does not take a sibling snapshot', () => {
        const mainConfig = { ...config, attributeMaps: [], attributeMerge: AttributeMergeMode.MainAccount } as any
        const service = new MappingService(mainConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current[FusionAttribute.MainAccount] = 'src-1::native-2'
        fusionAccount.attributeBag.current.department = 'Stale'
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                department: 'Other',
            },
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-2',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.department).not.toBe('Other')
        expect(fusionAccount.attributeBag.current.department).toBeUndefined()
    })

    it('Overlay and control keys are not implicit targets', () => {
        const service = new MappingService({ ...config, attributeMaps: [] } as any, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                schema: { name: 'account', id: 'native-1' },
                nativeIdentity: 'native-1',
                IIQDisabled: true,
                department: 'HR',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.source).toBeUndefined()
        expect(fusionAccount.attributeBag.current.schema).toBeUndefined()
        expect(fusionAccount.attributeBag.current.IIQDisabled).toBeUndefined()
    })

    it('Schema-only names are not mapping targets', () => {
        const service = new MappingService({ ...config, attributeMaps: [] } as any, mockLog)
        const fusionAccount = buildManagedAccount()
        delete fusionAccount.attributeBag.current.cloudLifecycleState
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                department: 'HR',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.cloudLifecycleState).toBeUndefined()
    })

    it('Origin resolves through the index for identity-origin', () => {
        const originConfig = {
            ...config,
            attributeMaps: [],
            attributeMerge: AttributeMergeMode.OriginAccount,
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

        expect(fusionAccount.attributeBag.current.department).toBe('HR')
    })

    it('Main account can resolve to the Identities snapshot', () => {
        const mainConfig = {
            ...config,
            attributeMaps: [],
            attributeMerge: AttributeMergeMode.MainAccount,
            sources: [{ name: 'Record Source' }],
        } as any
        const service = new MappingService(mainConfig, mockLog)
        const fusionAccount = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-1',
            name: 'Fusion One',
            sourceName: 'Identity Fusion',
            identityId: 'identity-1',
            attributes: {
                originSource: 'Identities',
                originAccount: 'identity-1',
                mainAccount: 'identity-1',
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

        expect(fusionAccount.attributeBag.current.department).toBe('HR')
    })

    it('Managed-origin Fusion account indexes Identities when the bag is present', () => {
        const mainConfig = { ...config, attributeMaps: [], attributeMerge: AttributeMergeMode.MainAccount } as any
        const service = new MappingService(mainConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.addIdentityLayer({
            id: 'identity-1',
            name: 'identity-one',
            attributes: { department: 'HR' },
        } as any)
        fusionAccount.attributeBag.current[FusionAttribute.MainAccount] = 'identity-1'
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                department: 'IT',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.department).toBe('HR')
    })

    it('does not expose the Identities snapshot when identity scope is disabled', () => {
        const disabledIdentityScopeConfig = {
            ...config,
            includeIdentities: false,
            attributeMaps: [
                {
                    newAttribute: 'names',
                    existingAttributes: ['firstname', 'lastname'],
                    attributeMerge: 'concatenate',
                },
            ],
        } as any
        const service = new MappingService(disabledIdentityScopeConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.addIdentityLayer({
            id: 'identity-1',
            name: 'identity-one',
            attributes: { firstname: 'Identity', lastname: 'Person', department: 'Identity HR' },
        } as any)
        fusionAccount.attributeBag.sources.set('Record Source', [{ givenName: 'Managed', familyName: 'Person' }])
        fusionAccount.setNeedsRefresh(true)

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.names).toBeUndefined()
        expect(fusionAccount.attributeBag.current.department).toBeUndefined()
    })

    it('Selective map does not implicit-merge extra keys', () => {
        const selectiveConfig = {
            ...config,
            attributeMaps: [{ newAttribute: 'employeeId', existingAttributes: ['emp_id'] }],
        } as any
        const service = new MappingService(selectiveConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.title = 'Kept'
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-1', name: 'Record Source' },
                nativeIdentity: 'native-1',
                emp_id: 'E123',
                title: 'Should not write',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun(), { onlyTargets: new Set(['employeeId']) })

        expect(fusionAccount.attributes.employeeId).toBe('E123')
        expect(fusionAccount.attributeBag.current.title).toBe('Kept')
    })
})

describe('MappingService vanished snapshot keys', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const baseConfig = {
        attributeMaps: [],
        attributeMerge: AttributeMergeMode.First,
        sources: [{ name: 'Record Source' }],
        fusionAccountRefreshThresholdInSeconds: 3600,
        maxHistoryMessages: 50,
        resetAccounts: false,
        resetForms: false,
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
    } as any

    beforeAll(() => {
        FusionAccount.configure(baseConfig)
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
        const fusionAccount = FusionAccount.fromManagedAccount(account)
        fusionAccount.setNeedsRefresh(true)
        return fusionAccount
    }

    function originSnapshot(extra: Record<string, unknown> = {}) {
        return {
            source: { id: 'src-1', name: 'Record Source' },
            nativeIdentity: 'native-1',
            ...extra,
        }
    }

    it('Unique definition value is preserved', () => {
        const service = new MappingService(
            {
                ...baseConfig,
                uniqueAttributeDefinitions: [
                    { name: 'UID', expression: 'WD', normalize: false, spaces: true, trim: true },
                ],
            } as any,
            mockLog
        )
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.UID = 'WD000015'
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ emp_id: 'E123' })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.UID).toBe('WD000015')
    })

    it('Definition-owned name on a snapshot is not merged by Map', () => {
        const service = new MappingService(
            {
                ...baseConfig,
                uniqueAttributeDefinitions: [
                    { name: 'UID', expression: 'WD', normalize: false, spaces: true, trim: true },
                ],
            } as any,
            mockLog
        )
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.UID = 'WD000015'
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ UID: 'from-source' })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.UID).toBe('WD000015')
    })

    it('Normal definition output is left to Define', () => {
        const service = new MappingService(
            {
                ...baseConfig,
                normalAttributeDefinitions: [
                    {
                        name: 'STUDENT_URL',
                        expression: '$STUDENT_ID',
                        normalize: false,
                        spaces: true,
                        trim: true,
                        refresh: true,
                    },
                ],
            } as any,
            mockLog
        )
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.STUDENT_URL = 'https://example.test/students/sailpoint-307803971'
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ emp_id: 'E123' })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.STUDENT_URL).toBe('https://example.test/students/sailpoint-307803971')
    })

    it('Normal definition name on a snapshot is merged by Map', () => {
        const service = new MappingService(
            {
                ...baseConfig,
                attributeMerge: AttributeMergeMode.MainAccount,
                normalAttributeDefinitions: [
                    {
                        name: 'CRSID',
                        expression: '$CRSID',
                        normalize: false,
                        spaces: true,
                        trim: true,
                        refresh: true,
                    },
                ],
            } as any,
            mockLog
        )
        const fusionAccount = buildManagedAccount()
        delete fusionAccount.attributeBag.current.CRSID
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ CRSID: 'sailpoint-AH2543' })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.CRSID).toBe('sailpoint-AH2543')
    })

    it('Selective mapping does not merge a Normal definition name', () => {
        const service = new MappingService(
            {
                ...baseConfig,
                attributeMaps: [{ newAttribute: 'employeeId', existingAttributes: ['emp_id'] }],
                normalAttributeDefinitions: [
                    {
                        name: 'CRSID',
                        expression: '$CRSID',
                        normalize: false,
                        spaces: true,
                        trim: true,
                        refresh: true,
                    },
                ],
            } as any,
            mockLog
        )
        const fusionAccount = buildManagedAccount()
        delete fusionAccount.attributeBag.current.CRSID
        fusionAccount.attributeBag.sources.set('Record Source', [
            originSnapshot({ emp_id: 'E123', CRSID: 'sailpoint-AH2543' }),
        ])

        service.mapAttributes(fusionAccount, new FusionRun(), { onlyTargets: new Set(['employeeId']) })

        expect(fusionAccount.attributeBag.current.CRSID).toBeUndefined()
        expect(fusionAccount.attributeBag.current.employeeId).toBe('E123')
    })

    it('Explicit map wins over definition-owned exclusion', () => {
        const service = new MappingService(
            {
                ...baseConfig,
                attributeMaps: [{ newAttribute: 'COLLEGE_NAME', existingAttributes: ['COLLEGE_NAME'] }],
                normalAttributeDefinitions: [
                    {
                        name: 'COLLEGE_NAME',
                        expression: '"ignored"',
                        normalize: false,
                        spaces: true,
                        trim: true,
                        refresh: true,
                    },
                ],
            } as any,
            mockLog
        )
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ COLLEGE_NAME: "St John's College" })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.COLLEGE_NAME).toBe("St John's College")
    })

    it('Attribute dropped by its origin source clears', () => {
        const service = new MappingService(baseConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.STUDENT_ID = 'sailpoint-307803971'
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ emp_id: 'E123' })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.STUDENT_ID).toBeUndefined()
    })

    it('Attribute dropped by a record source clears', () => {
        const recordConfig = {
            ...baseConfig,
            sources: [{ name: 'Origin Source' }, { name: 'Record Source' }],
        } as any
        const service = new MappingService(recordConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.department = 'Physics'
        fusionAccount.attributeBag.sources.set('Origin Source', [
            {
                source: { id: 'src-origin', name: 'Origin Source' },
                nativeIdentity: 'native-1',
            },
        ])
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-record', name: 'Record Source' },
                nativeIdentity: 'native-rec',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.department).toBeUndefined()
    })

    it('Vanished key still present on a snapshot is merged not cleared', () => {
        const service = new MappingService(baseConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.COLLEGE_ID = 'JOHNS'
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ COLLEGE_ID: 'TRIN' })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.COLLEGE_ID).toBe('TRIN')
    })

    it('Clearing does not require the selected snapshot to be present', () => {
        const mainConfig = { ...baseConfig, attributeMerge: AttributeMergeMode.MainAccount } as any
        const service = new MappingService(mainConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current[FusionAttribute.MainAccount] = 'src-missing::native-missing'
        fusionAccount.attributeBag.current.title = 'Reader'
        fusionAccount.attributeBag.sources.set('Record Source', [
            {
                source: { id: 'src-other', name: 'Record Source' },
                nativeIdentity: 'native-other',
                department: 'Other',
            },
        ])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.title).toBeUndefined()
    })

    it('Removing a definition row lets its leftover value clear', () => {
        const service = new MappingService({ ...baseConfig, normalAttributeDefinitions: [] } as any, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.STAFF_URL = 'https://example.test/staff/left-over'
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ emp_id: 'E123' })])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.STAFF_URL).toBeUndefined()
    })

    it('Selective mapping does not clear vanished keys', () => {
        const service = new MappingService(
            {
                ...baseConfig,
                attributeMaps: [{ newAttribute: 'employeeId', existingAttributes: ['emp_id'] }],
            } as any,
            mockLog
        )
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.STUDENT_ID = 'sailpoint-307803971'
        fusionAccount.attributeBag.sources.set('Record Source', [originSnapshot({ emp_id: 'E123' })])

        service.mapAttributes(fusionAccount, new FusionRun(), { onlyTargets: new Set(['employeeId']) })

        expect(fusionAccount.attributeBag.current.STUDENT_ID).toBe('sailpoint-307803971')
    })

    it('Fusion account with no managed context keeps its bag', () => {
        const service = new MappingService(baseConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.attributeBag.current.STUDENT_ID = 'sailpoint-307803971'
        fusionAccount.attributeBag.sources.set('Record Source', [])

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.STUDENT_ID).toBe('sailpoint-307803971')
    })

    it('does not replace current bag object when needsRefresh is false', () => {
        const service = new MappingService(baseConfig, mockLog)
        const fusionAccount = buildManagedAccount()
        fusionAccount.setNeedsRefresh(false)
        fusionAccount.attributeBag.current.STUDENT_ID = 'sailpoint-307803971'
        const before = fusionAccount.attributeBag.current

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.STUDENT_ID).toBe('sailpoint-307803971')
        expect(fusionAccount.attributeBag.current).toBe(before)
    })

    it('identity-origin account keeps a bag key backed by the Identities snapshot', () => {
        const service = new MappingService(baseConfig, mockLog)
        const fusionAccount = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-1',
            name: 'Fusion One',
            sourceName: 'Identity Fusion',
            identityId: 'identity-1',
            attributes: {
                originSource: 'Identities',
                originAccount: 'identity-1',
                statuses: ['baseline'],
                CRSID: 'sailpoint-AH2543',
            },
        } as any)
        fusionAccount.addIdentityLayer({
            id: 'identity-1',
            name: 'identity-one',
            attributes: { CRSID: 'sailpoint-AH2543' },
        } as any)
        fusionAccount.setNeedsRefresh(true)

        service.mapAttributes(fusionAccount, new FusionRun())

        expect(fusionAccount.attributeBag.current.CRSID).toBe('sailpoint-AH2543')
    })

    it('candidate list stays per-invocation with no MappingService candidate cache', () => {
        const service = new MappingService(baseConfig, mockLog)
        const first = buildManagedAccount()
        first.attributeBag.current.STUDENT_ID = 'sailpoint-307803971'
        first.attributeBag.sources.set('Record Source', [originSnapshot({ emp_id: 'E123' })])
        service.mapAttributes(first, new FusionRun())
        expect(first.attributeBag.current.STUDENT_ID).toBeUndefined()

        const second = buildManagedAccount()
        second.attributeBag.current.STUDENT_ID = 'sailpoint-307803971'
        second.attributeBag.sources.set('Record Source', [originSnapshot({ STUDENT_ID: 'fresh-id' })])
        service.mapAttributes(second, new FusionRun())
        expect(second.attributeBag.current.STUDENT_ID).toBe('fresh-id')
    })
})
