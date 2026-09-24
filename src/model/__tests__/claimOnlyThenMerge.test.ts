import { MappingService } from '../../services/mappingService/mappingService'
import { DefinitionService } from '../../services/definitionService/definitionService'
import { FusionAccount } from '../fusionAccount'
import { FusionConfig, AttributeMergeMode } from '../config'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionRun } from '../fusionRun'
import { FusionAttribute } from '../../data/schema'

/**
 * Grounded in recordings/company24509-poc/nadia step-10 (MelonHRM MEL0011 claim-only,
 * then MEL0010 same-run merge) without replaying the tenant recording in CI.
 */
describe('claim-only then same-run auto-merge rematerialization', () => {
    const melonSourceId = 'melon-hrm'
    const originKey = `${melonSourceId}::MEL0011`
    const blendKey = `${melonSourceId}::MEL0010`
    const fusionModified = '2024-06-01T12:00:00.000Z'

    const config = {
        sources: [{ name: 'MelonHRM', id: melonSourceId, type: 'authoritative' }],
        attributeMerge: AttributeMergeMode.MainAccount,
        attributeMaps: [
            { newAttribute: 'firstname', existingAttributes: ['givenName'] },
            { newAttribute: 'lastname', existingAttributes: ['familyName'] },
        ],
        normalAttributeDefinitions: [
            {
                name: 'employeeId',
                expression: '$!{sources.MelonHRM[0].employeeId}',
                normalize: false,
                spaces: true,
                trim: true,
                refresh: true,
            },
        ],
        uniqueAttributeDefinitions: [],
        fusionAccountRefreshThresholdInSeconds: 3600,
        maxHistoryMessages: 50,
        resetAccounts: false,
        resetForms: false,
    } as unknown as FusionConfig

    const mockLog = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLogLevel: vi.fn(() => 'info'),
    } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any

    beforeAll(() => {
        FusionAccount.configure(config)
    })

    const melonAccount = (nativeIdentity: string, attributes: Record<string, unknown>, modified: string): Account =>
        ({
            id: `isc-${nativeIdentity}`,
            sourceId: melonSourceId,
            nativeIdentity,
            sourceName: 'MelonHRM',
            modified,
            attributes,
        }) as Account

    it('firstname/lastname remain and Define $sources still sees origin snapshot for employeeId', async () => {
        const acc = FusionAccount.fromFusionAccount({
            nativeIdentity: 'nadya.petrova',
            id: 'ddc1ca65-fe36-4654-9c3f-d5d5fdce9799',
            name: 'nadya.petrova [MelonHRM]',
            sourceName: 'Identity Fusion NG',
            modified: fusionModified,
            attributes: {
                accounts: [originKey],
                [FusionAttribute.OriginSource]: 'MelonHRM',
                [FusionAttribute.OriginAccount]: originKey,
                firstname: 'Nadya',
                lastname: 'Petrova',
                employeeId: 'MelonHRM-MEL0011',
            },
        } as unknown as Account)

        const run = new FusionRun()
        run.setManagedAccount(
            originKey,
            melonAccount(
                'MEL0011',
                {
                    givenName: 'Nadya',
                    familyName: 'Petrova',
                    employeeId: 'MelonHRM-MEL0011',
                },
                '2024-01-01T00:00:00.000Z'
            )
        )
        acc.addManagedAccountLayer(run)
        expect(acc.needsRefresh).toBe(false)
        expect(acc.attributeBag.sources.get('MelonHRM')).toBeUndefined()

        acc.collections.accounts.add(blendKey)
        run.setManagedAccount(
            blendKey,
            melonAccount(
                'MEL0010',
                {
                    givenName: 'Nadia',
                    familyName: 'Petrova',
                    employeeId: 'MelonHRM-MEL0010',
                },
                '2024-06-01T14:00:00.000Z'
            )
        )
        acc.addManagedAccountLayer(run)
        expect(acc.needsRefresh).toBe(true)

        const mapping = new MappingService(config, mockLog)
        mapping.mapAttributes(acc, run)

        expect(acc.attributeBag.current.firstname).toBe('Nadya')
        expect(acc.attributeBag.current.lastname).toBe('Petrova')

        const definitions = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        await definitions.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.employeeId).toBe('MelonHRM-MEL0011')
    })
})
