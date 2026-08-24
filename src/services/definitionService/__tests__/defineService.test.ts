import { describe, it, expect, vi, beforeAll } from 'vitest'
import { DefinitionService } from '../definitionService'
import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'
import { InMemoryLockService } from '../../lockService'
import * as templateEvaluator from '../templateEvaluator'

describe('DefinitionService', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), getLogLevel: vi.fn(() => 'info') } as any
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
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), getLogLevel: vi.fn(() => 'info') } as any
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

    it('writes IdentityDocument.name (identity alias) to the display attribute when an identity is linked', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = buildAccountWithIdentity('Alice Anderson', 'aanderson')
        acc.attributeBag.current['name'] = 'persisted-old-value'
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('aanderson')
    })

    it('uses the login even when displayName differs', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = buildAccountWithIdentity('Display Name', 'login')
        acc.attributeBag.current['name'] = undefined
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('login')
        expect(acc.attributeBag.current['name']).not.toBe('Display Name')
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
        expect(acc.attributeBag.current['name']).toBe('login')
    })

    it('evaluates the display attribute definition for uncorrelated managed accounts even when source attributes seed previous', async () => {
        const service = new DefinitionService(
            {
                normalAttributeDefinitions: [{ name: 'name', expression: 'Definition Display Name' }],
                uniqueAttributeDefinitions: [],
                attributeMaps: [],
            } as any,
            mockSchemas,
            mockLog,
            mockLocks
        )
        const acc = FusionAccount.fromManagedAccount({
            id: 'src-a::acc-1',
            name: 'source-name',
            sourceId: 'src-a',
            nativeIdentity: 'acc-1',
            uncorrelated: true,
            attributes: { name: 'Source Attribute Name', employeeId: 'E1' },
        } as any)

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current['name']).toBe('Definition Display Name')
    })

    it('keeps persisted fusion display values immutable for existing fusion rows', async () => {
        const service = new DefinitionService(
            {
                normalAttributeDefinitions: [{ name: 'name', expression: 'New Definition Value' }],
                uniqueAttributeDefinitions: [],
                attributeMaps: [],
            } as any,
            mockSchemas,
            mockLog,
            mockLocks
        )
        const acc = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-1',
            name: 'Persisted Name',
            sourceName: 'Identity Fusion NG',
            attributes: {
                name: 'Persisted Display Name',
                employeeId: 'E1',
            },
        } as any)

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current['name']).toBe('Persisted Display Name')
    })

    it('preserves display attribute from a normal definition through refresh and output override', async () => {
        const service = new DefinitionService(
            {
                normalAttributeDefinitions: [{ name: 'name', expression: 'Definition Display Name' }],
                uniqueAttributeDefinitions: [],
                attributeMaps: [],
            } as any,
            mockSchemas,
            mockLog,
            mockLocks
        )
        const acc = FusionAccount.fromManagedAccount({
            id: 'src-a::acc-1',
            name: 'source-name',
            sourceId: 'src-a',
            nativeIdentity: 'acc-1',
            uncorrelated: true,
        } as any)
        acc.addIdentityLayer({
            id: 'identity-1',
            name: 'login',
            displayName: 'Identity Alias',
            attributes: {},
        } as any)

        await service.refreshNormalAttributes(acc)
        await service.refreshUniqueAttributes(acc)
        service.applyDisplayAttributeOverride(acc)

        expect(acc.attributeBag.current['name']).toBe('Definition Display Name')
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
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), getLogLevel: vi.fn(() => 'info') } as any
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

describe('DefinitionService.refreshNormalAttributes clearing', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), getLogLevel: vi.fn(() => 'info') } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any

    beforeAll(() => {
        const minimalConfig = {
            sources: [{ name: 'HR', id: 'src-hr', type: 'authoritative' }],
            fusionAccountRefreshThresholdInSeconds: 3600,
            maxHistoryMessages: 50,
            resetAccounts: false,
            resetForms: false,
        } as unknown as FusionConfig
        FusionAccount.configure(minimalConfig)
    })

    const createService = (normalAttributeDefinitions: any[]) =>
        new DefinitionService(
            {
                normalAttributeDefinitions,
                uniqueAttributeDefinitions: [],
                attributeMaps: [],
                skipAccountsWithMissingId: false,
                forceAttributeRefresh: false,
            } as any,
            mockSchemas,
            mockLog,
            mockLocks
        )

    const createRefreshableAccount = (attrs: Record<string, any> = {}) => {
        const acc = FusionAccount.fromManagedAccount({
            id: 'src-hr::acc-1',
            name: 'neo-1',
            sourceId: 'src-hr',
            nativeIdentity: 'acc-1',
            uncorrelated: true,
            attributes: { ...attrs },
        } as any)
        acc.setNeedsRefresh(true)
        return acc
    }

    it('clears existing normal attribute when template evaluates to empty output', async () => {
        const service = createService([
            {
                name: 'formattedDate',
                expression: '$Datefns.format($Datefns.parse($INACTIVE_DATE, "yyyy-MM-dd"))',
            },
        ])
        const acc = createRefreshableAccount({ formattedDate: '2024-01-15' })

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.formattedDate).toBeUndefined()
    })

    it('removes cleared attribute from velocity context for downstream definitions', async () => {
        const service = createService([
            {
                name: 'formattedDate',
                expression: '$Datefns.format($Datefns.parse($INACTIVE_DATE, "yyyy-MM-dd"))',
            },
            {
                name: 'derived',
                expression: 'prefix-$!{formattedDate}-suffix',
            },
        ])
        const acc = createRefreshableAccount({
            formattedDate: '2024-01-15',
            derived: '2024-01-15',
        })

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.formattedDate).toBeUndefined()
        expect(acc.attributeBag.current.derived).toBe('prefix--suffix')
    })

    it('clears existing normal attribute when template evaluation returns error', async () => {
        const service = createService([{ name: 'department', expression: '' }])
        const acc = createRefreshableAccount({ department: 'Engineering' })

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.department).toBeUndefined()
        expect(mockLog.error).toHaveBeenCalled()
    })

    it('applies safe default for display attribute on falsy output instead of clearing', async () => {
        const service = createService([
            { name: 'name', expression: '$Datefns.format($Datefns.parse($missingDate, "yyyy-MM-dd"))' },
        ])
        const acc = createRefreshableAccount()

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.name).toBe('neo-1')
    })

    it('applies safe default for identity attribute on falsy output instead of clearing', async () => {
        const service = createService([
            { name: 'id', expression: '$Datefns.format($Datefns.parse($missingDate, "yyyy-MM-dd"))' },
        ])
        const acc = createRefreshableAccount()

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )
    })

    it('static definition with existing value skips evaluation on existing fusion rows', async () => {
        const service = createService([
            { name: 'department', expression: 'New Value', static: true },
        ])
        const acc = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-1',
            name: 'Persisted Name',
            sourceName: 'Identity Fusion NG',
            attributes: {
                department: 'Engineering',
                employeeId: 'E1',
            },
        } as any)
        acc.setNeedsRefresh(true)

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.department).toBe('Engineering')
    })

    it('non-nullish rendered value overwrites existing value', async () => {
        const service = createService([{ name: 'fullName', expression: 'Jane Smith' }])
        const acc = createRefreshableAccount({ fullName: 'Jane Doe' })

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.fullName).toBe('Jane Smith')
    })

    it('later Normal definition sees an earlier write', async () => {
        const service = createService([
            { name: 'first', expression: 'Ada' },
            { name: 'full', expression: '$first' },
        ])
        const acc = createRefreshableAccount()

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.full).toBe('Ada')
    })

    it('special context keys override current bag names', async () => {
        const service = createService([{ name: 'identityName', expression: '$identity.name' }])
        const acc = createRefreshableAccount({ identity: 'not-the-identity-object' })
        acc.addIdentityLayer({
            id: 'identity-jane',
            name: 'Jane',
            attributes: { name: 'Jane' },
        } as any)

        await service.refreshNormalAttributes(acc)

        expect(acc.attributeBag.current.identityName).toBe('Jane')
    })
})

describe('DefinitionService.refreshUniqueAttributes unique-registry lock', () => {
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any

    const createFusionAccount = (attrs: Record<string, any> = {}) => {
        const attributeBag = {
            current: { ...attrs },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'neo-1',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            isMatch: false,
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

    it('does not hold unique:${name} during evaluateAttributeTemplate', async () => {
        let uniqueLockHeld = false
        let evaluatedOutsideUniqueLock = false
        const originalEvaluate = templateEvaluator.evaluateAttributeTemplate
        const evaluateSpy = vi.spyOn(templateEvaluator, 'evaluateAttributeTemplate').mockImplementation((...args) => {
            if (!uniqueLockHeld) evaluatedOutsideUniqueLock = true
            return originalEvaluate(...args)
        })

        const mockLog = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            getLogLevel: vi.fn(() => 'info'),
        } as any
        const mockLocks = {
            withLock: vi.fn(async (key: string, fn: () => Promise<any>) => {
                if (String(key).startsWith('unique:')) {
                    uniqueLockHeld = true
                    try {
                        return await fn()
                    } finally {
                        uniqueLockHeld = false
                    }
                }
                return fn()
            }),
        } as any

        const service = new DefinitionService(
            {
                normalAttributeDefinitions: [],
                uniqueAttributeDefinitions: [
                    {
                        name: 'UID',
                        expression: 'STATIC-UID',
                        useIncrementalCounter: false,
                        digits: 1,
                    },
                ],
                attributeMaps: [],
                skipAccountsWithMissingId: false,
                forceAttributeRefresh: false,
                maxAttempts: 20,
            } as any,
            mockSchemas,
            mockLog,
            mockLocks
        )
        service.setStateWrapper({})

        await service.refreshUniqueAttributes(createFusionAccount())

        expect(evaluateSpy).toHaveBeenCalled()
        expect(evaluatedOutsideUniqueLock).toBe(true)
        evaluateSpy.mockRestore()
    })

    it('two concurrent refreshUniqueAttributes calls for the same unique attribute store distinct values', async () => {
        const mockLog = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            getLogLevel: vi.fn(() => 'info'),
        } as any
        const locks = new InMemoryLockService(mockLog)
        const service = new DefinitionService(
            {
                normalAttributeDefinitions: [],
                uniqueAttributeDefinitions: [
                    {
                        name: 'UID',
                        expression: 'USER',
                        useIncrementalCounter: false,
                        digits: 1,
                    },
                ],
                attributeMaps: [],
                skipAccountsWithMissingId: false,
                forceAttributeRefresh: false,
                maxAttempts: 20,
            } as any,
            mockSchemas,
            mockLog,
            locks
        )
        service.setStateWrapper({})

        const first = createFusionAccount()
        first.name = 'neo-1'
        const second = createFusionAccount()
        second.name = 'neo-2'

        await Promise.all([service.refreshUniqueAttributes(first), service.refreshUniqueAttributes(second)])

        expect(first.attributes.UID).toBeTruthy()
        expect(second.attributes.UID).toBeTruthy()
        expect(first.attributes.UID).not.toBe(second.attributes.UID)
        const registered = (service as any).getUniqueValues('UID') as Set<string>
        expect(registered.has(String(first.attributes.UID))).toBe(true)
        expect(registered.has(String(second.attributes.UID))).toBe(true)
    })
})
