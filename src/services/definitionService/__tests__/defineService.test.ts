import { describe, it, expect, vi, beforeAll } from 'vitest'
import { DefinitionService } from '../definitionService'
import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'

describe('DefinitionService', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any
    const config = {
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
        attributeMaps: [],
    } as any

    it('is instantiable', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        expect(service).toBeDefined()
    })
})

describe('DefinitionService.applyDisplayAttributeOverride', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any
    const config = {
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
        attributeMaps: [],
    } as any

    beforeAll(() => {
        const minimalConfig = {
            sources: [
                { name: 'Source A', id: 'src-a', type: 'authoritative' },
                { name: 'Source B', id: 'src-b', type: 'record' },
            ],
            fusionAccountRefreshThresholdInSeconds: 3600,
            maxHistoryMessages: 50,
            resetAccounts: false,
            resetForms: false,
        } as unknown as FusionConfig
        FusionAccount.configure(minimalConfig)
    })

    function buildAccountWithIdentity(displayName: string, loginName: string): FusionAccount {
        const acc = FusionAccount.fromIdentity({ id: 'id-1', name: loginName, displayName } as any)
        acc.setNeedsReset(true)
        return acc
    }

    it('writes the identity alias (displayName) to the display attribute when an identity is linked', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = buildAccountWithIdentity('Alice Anderson', 'aanderson')
        acc.attributeBag.current['name'] = 'persisted-old-value'
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('Alice Anderson')
    })

    it('uses the alias even when it differs from the login', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = buildAccountWithIdentity('Display Name', 'login')
        acc.attributeBag.current['name'] = undefined
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('Display Name')
        expect(acc.attributeBag.current['name']).not.toBe('login')
    })

    it('skips the override when isIdentity is false', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = FusionAccount.fromManagedAccount({
            id: 'src-b::acc-1',
            name: 'source-name',
            sourceId: 'src-b',
            nativeIdentity: 'acc-1',
        } as any)
        acc.attributeBag.current['name'] = 'persisted'
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('persisted')
    })

    it('skips the override for uncorrelated managed accounts even after addIdentityLayer', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = FusionAccount.fromManagedAccount({
            id: 'src-a::acc-1',
            name: 'source-name',
            sourceId: 'src-a',
            nativeIdentity: 'acc-1',
            uncorrelated: true,
        } as any)
        acc.attributeBag.current['name'] = 'Mapped Display Name'
        acc.addIdentityLayer({
            id: 'identity-1',
            name: 'login',
            displayName: 'Identity Alias',
            attributes: {},
        } as any)
        expect(acc.isIdentity).toBe(false)
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('Mapped Display Name')
    })

    it('still overrides for correlated managed-account origins (source uncorrelated=false)', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = FusionAccount.fromManagedAccount({
            id: 'src-a::acc-1',
            name: 'source-name',
            sourceId: 'src-a',
            nativeIdentity: 'acc-1',
            uncorrelated: false,
            identityId: 'identity-1',
        } as any)
        acc.attributeBag.current['name'] = 'source-name'
        acc.addIdentityLayer({
            id: 'identity-1',
            name: 'login',
            displayName: 'Alice Anderson',
            attributes: { displayName: 'Alice Anderson' },
        } as any)
        expect(acc.isIdentity).toBe(true)
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('Alice Anderson')
    })

    it('skips the override for persisted uncorrelated fusion rows after addIdentityLayer', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-1',
            name: 'Persisted Non Match',
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            identityId: 'identity-1',
            attributes: {
                name: 'Mapped Display Name',
                identityId: 'identity-1',
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as any)
        acc.addIdentityLayer({
            id: 'identity-1',
            name: 'login',
            displayName: 'Identity Alias',
            attributes: { displayName: 'Identity Alias' },
        } as any)
        expect(acc.isIdentity).toBe(false)
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('Mapped Display Name')
    })
})


describe('DefinitionService.refreshUniqueAttributes preservation', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any

    const createService = (uniqueAttributeDefinitions: any[]) => {
        const config = {
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions,
            attributeMaps: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
            maxAttempts: 20,
        } as any
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        service.setStateWrapper({})
        return service
    }

    const createFusionAccount = (attrs: Record<string, any>, options: { needsReset?: boolean } = {}) => {
        const attributeBag = {
            current: { ...attrs },
            previous: Object.keys(attrs).length > 0 ? { ...attrs } : {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: options.needsReset ?? false,
            name: 'neo-1',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }

        Object.defineProperty(fusionAccount, 'attributes', {
            get: () => attributeBag.current,
            set: (value) => {
                attributeBag.current = value
            },
        })

        return fusionAccount
    }

    it('preserves existing unique values when needsRefresh is true but needsReset is false', async () => {
        const service = createService([
            {
                name: 'UID',
                expression: 'WD$counter',
                useIncrementalCounter: true,
                digits: 6,
                counterStart: 1,
            },
        ])
        await service.initializeCounters()

        const existing = createFusionAccount({ UID: 'WD000015' })
        await service.registerUniqueAttributes(existing)
        await service.refreshUniqueAttributes(existing)

        expect(existing.attributes.UID).toBe('WD000015')
        expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('seeds the persistent counter from existing incremental values', async () => {
        const service = createService([
            {
                name: 'UID',
                expression: 'NG$counter',
                useIncrementalCounter: true,
                digits: 3,
                counterStart: 1,
            },
        ])
        await service.initializeCounters()

        const existing = createFusionAccount({ UID: 'NG015' })
        await service.refreshUniqueAttributes(existing)

        expect(await service.getStateObject()).toEqual({ UID: 15 })

        const next = createFusionAccount({})
        await service.refreshUniqueAttributes(next)

        expect(next.attributes.UID).toBe('NG016')
        expect(await service.getStateObject()).toEqual({ UID: 16 })
    })

    it('regenerates unique values when needsReset is true', async () => {
        const service = createService([
            {
                name: 'UID',
                expression: 'generated-$counter',
                useIncrementalCounter: false,
                digits: 1,
            },
        ])

        const account = createFusionAccount({ UID: 'old-value' }, { needsReset: true })
        await service.registerUniqueAttributes(account)
        await service.refreshUniqueAttributes(account)

        expect(account.attributes.UID).not.toBe('old-value')
    })
})

