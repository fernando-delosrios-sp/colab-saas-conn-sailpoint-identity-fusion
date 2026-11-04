import crypto from 'crypto'
import { DefinitionService } from '../definitionService'
import { InMemoryLockService } from '../../lockService'

const transforms = { normalize: false, spaces: false, trim: false }

describe('DefinitionService per base value counter', () => {
    const mockLog = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLogLevel: vi.fn(() => 'info'),
    } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any

    function createLocks() {
        const keys: string[] = []
        const locks = {
            withLock: vi.fn((key: string, fn: () => Promise<any>) => {
                keys.push(key)
                return fn()
            }),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        }
        return { locks: locks as unknown as InMemoryLockService, keys }
    }

    function createService(
        uniqueAttributeDefinitions: any[],
        options: { state?: Record<string, unknown>; sourceService?: any; locks?: InMemoryLockService } = {}
    ) {
        const { locks } = options.locks ? { locks: options.locks } : createLocks()
        const config = {
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions,
            attributeMaps: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
            maxAttempts: 20,
            fusionState: options.state,
        } as any
        const service = new DefinitionService(config, mockSchemas, mockLog, locks, options.sourceService)
        if (options.state) service.setStateWrapper(options.state)
        else service.setStateWrapper({})
        return service
    }

    function createAccount(attrs: Record<string, any>, name = 'neo-1') {
        const attributeBag = {
            current: { ...attrs },
            previous: Object.keys(attrs).length > 0 ? { ...attrs } : {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
            sourceAccountContexts: [],
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name,
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

    function uniqueDef(overrides: Record<string, unknown>) {
        return {
            name: 'UID',
            expression: '$prefix$counter',
            digits: 1,
            counterStart: 1,
            useIncrementalCounter: true,
            ...transforms,
            ...overrides,
        }
    }

    it('Omitted option uses one attribute counter', async () => {
        const service = createService([uniqueDef({ expression: 'X$counter' })])
        await service.initializeCounters()

        const first = createAccount({}, 'a')
        const second = createAccount({}, 'b')
        await service.refreshUniqueAttributes(first)
        await service.refreshUniqueAttributes(second)

        expect(first.attributes.UID).toBe('X1')
        expect(second.attributes.UID).toBe('X2')
        expect(await service.getStateObject()).toEqual({ UID: 2 })
    })

    it('Option is ignored when the incremental counter is off', async () => {
        const service = createService([
            uniqueDef({
                expression: 'taken',
                useIncrementalCounter: false,
                counterPerBase: true,
            }),
        ])
        await service.initializeCounters()

        const first = createAccount({}, 'a')
        const second = createAccount({}, 'b')
        await service.refreshUniqueAttributes(first)
        await service.refreshUniqueAttributes(second)

        expect(first.attributes.UID).toBe('taken')
        expect(second.attributes.UID).toBe('taken1')
        expect(await service.getStateObject()).toEqual({})
    })

    it('Consecutive bases keep their own numbers', async () => {
        const patchSourceConfig = vi.fn().mockResolvedValue(undefined)
        const service = createService([uniqueDef({ counterPerBase: true })], {
            sourceService: { fusionSourceId: 'fusion-src', patchSourceConfig },
        })
        await service.initializeCounters()

        const prefixes = ['ab', 'ab', 'bb', 'ab']
        const values: string[] = []
        for (const [index, prefix] of prefixes.entries()) {
            const account = createAccount({ prefix }, `a${index}`)
            await service.refreshUniqueAttributes(account)
            values.push(account.attributes.UID)
        }

        expect(values).toEqual(['ab1', 'ab2', 'bb1', 'ab3'])
        expect(await service.getStateObject()).toEqual({ UID: { ab: 3, bb: 1 } })

        await service.saveState()
        expect(patchSourceConfig).toHaveBeenCalledWith(
            'fusion-src',
            '/connectorAttributes/fusionState',
            { UID: { ab: 3, bb: 1 } },
            'DefinitionService>saveState'
        )
    })

    it('A conditional may omit the counter when it is zero', async () => {
        const service = createService([
            uniqueDef({
                counterPerBase: true,
                counterStart: 0,
                expression: '#set($base = "ab")#if($counter == 0)$base#else$base$counter#end',
            }),
        ])
        await service.initializeCounters()

        const account = createAccount({}, 'a')
        await service.refreshUniqueAttributes(account)

        expect(account.attributes.UID).toBe('ab')
    })

    it('The next number for that base is printed', async () => {
        const service = createService([
            uniqueDef({
                counterPerBase: true,
                counterStart: 0,
                expression: '#set($base = "ab")#if($counter == 0)$base#else$base$counter#end',
            }),
        ])
        await service.initializeCounters()

        const first = createAccount({}, 'a')
        const second = createAccount({}, 'b')
        await service.refreshUniqueAttributes(first)
        await service.refreshUniqueAttributes(second)

        expect(first.attributes.UID).toBe('ab')
        expect(second.attributes.UID).toBe('ab1')
    })

    it('A kept value does not seed the per-base counter', async () => {
        const service = createService([uniqueDef({ counterPerBase: true, counterStart: 1 })])
        await service.initializeCounters()

        const kept = createAccount({ UID: 'ab7' }, 'kept')
        await service.refreshUniqueAttributes(kept)

        const next = createAccount({ prefix: 'ab' }, 'next')
        await service.refreshUniqueAttributes(next)

        expect(kept.attributes.UID).toBe('ab7')
        expect(next.attributes.UID).toBe('ab1')
        expect(await service.getStateObject()).toEqual({ UID: { ab: 1 } })
    })

    it('Kept value raises the single attribute counter', async () => {
        const service = createService([
            uniqueDef({
                expression: 'NG$counter',
                counterPerBase: false,
                digits: 3,
                counterStart: 1,
            }),
        ])
        await service.initializeCounters()

        const kept = createAccount({ UID: 'NG015' }, 'kept')
        await service.refreshUniqueAttributes(kept)

        const next = createAccount({}, 'next')
        await service.refreshUniqueAttributes(next)

        expect(kept.attributes.UID).toBe('NG015')
        expect(next.attributes.UID).toBe('NG016')
        expect(await service.getStateObject()).toEqual({ UID: 16 })
    })

    it('Missing counter reference fails at initialization', async () => {
        const missing = createService([uniqueDef({ expression: 'fixed-value' })])
        await expect(missing.initializeCounters()).rejects.toThrow(
            /Unique attribute "UID" expression does not reference \$counter/
        )

        const uuidOnly = createService([uniqueDef({ expression: '$UUID' })])
        await expect(uuidOnly.initializeCounters()).rejects.toThrow(
            /Unique attribute "UID" expression does not reference \$counter/
        )
    })

    it('Formal and quiet counter references are accepted', async () => {
        const service = createService([
            uniqueDef({ name: 'formal', expression: 'id-${counter}' }),
            uniqueDef({ name: 'quiet', expression: 'id-$!counter' }),
            uniqueDef({ name: 'quietFormal', expression: 'id-$!{counter}' }),
        ])

        await expect(service.initializeCounters()).resolves.toBeUndefined()
    })

    it('Registered per-base value fails the operation', async () => {
        const registered = createService([uniqueDef({ counterPerBase: true })])
        await registered.initializeCounters()
        registered.registerExistingValues('UID', ['ab1'])

        const account = createAccount({ prefix: 'ab' }, 'a')
        await expect(registered.refreshUniqueAttributes(account)).rejects.toThrow(
            /Unique attribute "UID" rendered "ab1".*hide \$counter.*lost or reset.*managed-source or customizer.*truncation/s
        )
        expect(account.attributes.UID).toBeUndefined()
        expect(await registered.getStateObject()).toEqual({ UID: { ab: 1 } })

        const fromCustomizer = createService([uniqueDef({ counterPerBase: true })])
        await fromCustomizer.initializeCounters()
        fromCustomizer.setCustomizerValueStore({
            has: (attribute: string, candidate: string) => attribute === 'UID' && candidate === 'ab1',
        } as any)
        const other = createAccount({ prefix: 'ab' }, 'b')
        await expect(fromCustomizer.refreshUniqueAttributes(other)).rejects.toThrow(/rendered "ab1"/)
        expect(other.attributes.UID).toBeUndefined()
        expect(await fromCustomizer.getStateObject()).toEqual({ UID: { ab: 1 } })
    })

    it('Bases that differ past the reserved width share a counter', async () => {
        const service = createService([uniqueDef({ counterPerBase: true, maxLength: 4, digits: 1 })])
        await service.initializeCounters()

        const first = createAccount({ prefix: 'abcd' }, 'a')
        const second = createAccount({ prefix: 'abce' }, 'b')
        await service.refreshUniqueAttributes(first)
        await service.refreshUniqueAttributes(second)

        expect(first.attributes.UID).toBe('abc1')
        expect(second.attributes.UID).toBe('abc2')
        expect(await service.getStateObject()).toEqual({ UID: { abc: 2 } })
    })

    it('A counter wider than the reserved digits fails', async () => {
        const service = createService([uniqueDef({ counterPerBase: true, maxLength: 8, digits: 1 })], {
            state: { UID: { ab: 9 } },
        })
        await service.initializeCounters()

        const account = createAccount({ prefix: 'ab' }, 'a')
        await expect(service.refreshUniqueAttributes(account)).rejects.toThrow(/Minimum counter digits/)
        expect(account.attributes.UID).toBeUndefined()
        expect(registeredValues(service)).not.toContain('ab10')
        expect(await service.getStateObject()).toEqual({ UID: { ab: 9 } })
    })

    it('A maximum length that cannot hold the counter fails at initialization', async () => {
        const service = createService([uniqueDef({ counterPerBase: true, maxLength: 1, digits: 1 })])

        await expect(service.initializeCounters()).rejects.toThrow(/UID[\s\S]*Minimum counter digits/)
    })

    it('A saved number is rejected when per-base counting is on', async () => {
        const service = createService([uniqueDef({ counterPerBase: true })], { state: { UID: 5 } })

        await expect(service.initializeCounters()).rejects.toThrow(
            /Unique attribute "UID"[\s\S]*Per base value counter\?[\s\S]*reset Fusion state/
        )
    })

    it('A saved base map is rejected when per-base counting is off', async () => {
        const service = createService([uniqueDef({ counterPerBase: false })], { state: { UID: { ab: 2 } } })

        await expect(service.initializeCounters()).rejects.toThrow(
            /Unique attribute "UID"[\s\S]*Per base value counter\?[\s\S]*reset Fusion state/
        )
    })

    it('Different base values do not share a lock', async () => {
        const { locks, keys } = createLocks()
        const service = createService([uniqueDef({ counterPerBase: true })], { locks })
        await service.initializeCounters()

        const first = createAccount({ prefix: 'ab' }, 'a')
        const second = createAccount({ prefix: 'bb' }, 'b')
        await Promise.all([service.refreshUniqueAttributes(first), service.refreshUniqueAttributes(second)])

        expect([first.attributes.UID, second.attributes.UID].sort()).toEqual(['ab1', 'bb1'])
        const counterKeys = keys.filter((key) => key.startsWith('counter:UID'))
        expect(counterKeys).toEqual(expect.arrayContaining(['counter:UID:ab', 'counter:UID:bb']))
        expect(counterKeys).not.toContain('counter:UID')
    })

    it('UUID-based unique attribute generated', async () => {
        const spy = vi.spyOn(crypto, 'randomUUID')
        spy.mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
            .mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
            .mockReturnValueOnce('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')

        try {
            const service = createService([uniqueDef({ expression: '$UUID', useIncrementalCounter: false })])
            const first = createAccount({}, 'a')
            const second = createAccount({}, 'b')
            await service.refreshUniqueAttributes(first)
            await service.refreshUniqueAttributes(second)

            expect(first.attributes.UID).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
            expect(second.attributes.UID).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
        } finally {
            spy.mockRestore()
        }
    })

    it('Collision-based unique attribute with $counter', async () => {
        const service = createService([uniqueDef({ expression: 'user', useIncrementalCounter: false, digits: 1 })])
        const first = createAccount({}, 'a')
        const second = createAccount({}, 'b')
        await service.refreshUniqueAttributes(first)
        await service.refreshUniqueAttributes(second)

        expect(first.attributes.UID).toBe('user')
        expect(second.attributes.UID).toBe('user1')
    })

    it('Incremental counter unique attribute', async () => {
        const service = createService([
            uniqueDef({ expression: 'EMP-$counter', counterPerBase: false, counterStart: 1 }),
        ])
        await service.initializeCounters()

        const first = createAccount({}, 'a')
        const second = createAccount({}, 'b')
        await service.refreshUniqueAttributes(first)
        await service.refreshUniqueAttributes(second)

        expect(first.attributes.UID).toBe('EMP-1')
        expect(second.attributes.UID).toBe('EMP-2')
        expect(await service.getStateObject()).toEqual({ UID: 2 })
    })

    it('Persistent counter increments safely', async () => {
        const service = createService([
            uniqueDef({ expression: 'EMP-$counter', counterPerBase: false, counterStart: 1 }),
        ])
        await service.initializeCounters()

        const first = createAccount({}, 'a')
        const second = createAccount({}, 'b')
        await Promise.all([service.refreshUniqueAttributes(first), service.refreshUniqueAttributes(second)])

        expect([first.attributes.UID, second.attributes.UID].sort()).toEqual(['EMP-1', 'EMP-2'])
        expect(await service.getStateObject()).toEqual({ UID: 2 })
    })
})

function registeredValues(service: DefinitionService): string[] {
    return Array.from((service as any).getUniqueValues('UID') as Set<string>)
}
