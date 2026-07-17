import { AttributeService } from '../attributeService'
import * as uuid from 'uuid'

vi.mock('uuid', async () => {
    const originalModule = await vi.importActual<typeof import('uuid')>('uuid')
    return {
        ...originalModule,
        v4: vi.fn().mockImplementation(originalModule.v4),
    }
})
describe('AttributeService mapping targets for definition context', () => {
    const createService = () => {
        const config = {
            attributeMaps: [
                {
                    newAttribute: 'nickname',
                    existingAttributes: ['preferredName'],
                    attributeMerge: 'first',
                },
            ],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'computedAlias',
                    expression: '$nickname',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const createFusionAccount = () => {
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            preferredName: 'Neo',
                            source: { name: 'HR' },
                        },
                    ],
                ],
            ]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
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

    it('maps attributeMap targets even when they are outside schema', () => {
        const service = createService()
        const fusionAccount = createFusionAccount()

        service.mapAttributes(fusionAccount)

        expect(fusionAccount.attributes.nickname).toBe('Neo')
    })

    it('makes non-schema mapped targets available to normal attribute definitions', async () => {
        const service = createService()
        const fusionAccount = createFusionAccount()

        service.mapAttributes(fusionAccount)
        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.computedAlias).toBe('Neo')
    })
})

describe('Static attribute evaluation logic', () => {
    const createTestEnvironment = (staticDef: any) => {
        const config = {
            attributeMaps: [{ newAttribute: 'firstname', existingAttributes: ['fn'], attributeMerge: 'first' }],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'staticAttr',
                    expression: '#set($val = "generated")#if($firstname)$firstname#else$val#end',
                    refresh: false,
                    static: true,
                    spaces: false,
                    trim: false,
                    normalize: false,
                    ...staticDef,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'staticAttr']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'staticAttr' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const service = new AttributeService(config, schemas, sourceService, log)
        return { service, config }
    }

    const createMockAccount = (initialAttributes: Record<string, any>, fnValue: string) => {
        return {
            type: 'managed',
            needsRefresh: false,
            needsReset: false,
            name: 'id123',
            sourceName: 'HR',
            nativeIdentity: 'id123',
            sources: ['HR'],
            history: [],
            managedAccounts: [{ sourceName: 'HR', nativeIdentity: 'n1', attributes: { fn: fnValue } }],
            attributes: { ...initialAttributes },
            attributeBag: {
                current: {},
                previous: {},
                identity: {},
                accounts: [],
                sources: new Map([['HR', [{ fn: fnValue, source: { name: 'HR', id: 'hr1' }, schema: { id: 'id', name: 'name' } }]]]),
            },
            setNeedsRefresh(val: boolean) { this.needsRefresh = val },
            setNeedsReset(val: boolean) { this.needsReset = val },
        } as any
    }

    it('evaluates a static attribute when no value is present', async () => {
        const { service } = createTestEnvironment({})
        const fusionAccount = createMockAccount({ firstname: 'John' }, 'John')
        fusionAccount.setNeedsRefresh(true)

        service.mapAttributes(fusionAccount)
        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.staticAttr).toBe('John')
    })

    it('does NOT re-evaluate a static attribute on subsequent aggregations even if needsRefresh is true', async () => {
        const { service } = createTestEnvironment({})
        const fusionAccount = createMockAccount({ firstname: 'Jane', staticAttr: 'OldValue' }, 'Jane')
        fusionAccount.setNeedsRefresh(true)

        service.mapAttributes(fusionAccount)
        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.staticAttr).toBe('OldValue')
    })

    it('DOES re-evaluate a static attribute if needsReset is explicitly true', async () => {
        const { service } = createTestEnvironment({})
        const fusionAccount = createMockAccount({ firstname: 'Jane', staticAttr: 'OldValue' }, 'Jane')
        fusionAccount.setNeedsRefresh(true)
        fusionAccount.setNeedsReset(true)

        service.mapAttributes(fusionAccount)
        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.staticAttr).toBe('Jane')
    })
})

describe('AttributeService mainAccount stale cleanup', () => {
    it('clears mainAccount when mapping no longer finds a supporting source value', () => {
        const config = {
            attributeMaps: [
                {
                    newAttribute: 'mainAccount',
                    existingAttributes: ['accountKey'],
                    attributeMerge: 'first',
                },
            ],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'mainAccount']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'mainAccount' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            accountKey: 'src-hr::acct-1',
                            _id: 'src-hr::acct-1',
                            source: { id: 'src-hr', name: 'HR' },
                            schema: { id: 'acct-1', name: 'acct-1' },
                        },
                    ],
                ],
            ]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        service.mapAttributes(fusionAccount)
        expect(fusionAccount.attributes.mainAccount).toBe('src-hr::acct-1')

        attributeBag.sources.set('HR', [{ source: { name: 'HR' } }])
        service.mapAttributes(fusionAccount)
        expect(fusionAccount.attributes.mainAccount).toBeUndefined()
    })
})

describe('AttributeService mapping undefined behavior', () => {
    it('clears stale mapped attributes when mapping resolves to undefined', () => {
        const config = {
            attributeMaps: [
                {
                    newAttribute: 'nickname',
                    existingAttributes: ['preferredName'],
                    attributeMerge: 'first',
                },
            ],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'nickname']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'nickname' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: { nickname: 'old-value' },
            previous: { nickname: 'old-value' },
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            preferredName: 'Neo',
                            _id: 'src-hr::acct-1',
                            source: { id: 'src-hr', name: 'HR' },
                            schema: { id: 'acct-1', name: 'Neo' },
                        },
                    ],
                ],
            ]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        service.mapAttributes(fusionAccount)
        expect(fusionAccount.attributes.nickname).toBe('Neo')

        attributeBag.sources.set('HR', [{ source: { name: 'HR' } }])
        service.mapAttributes(fusionAccount)
        expect(fusionAccount.attributes.nickname).toBeUndefined()
    })

    it('keeps current mapped values when no managed accounts and no identity remain', () => {
        const config = {
            attributeMaps: [
                {
                    newAttribute: 'nickname',
                    existingAttributes: ['preferredName'],
                    attributeMerge: 'first',
                },
            ],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'nickname']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'nickname' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: { nickname: 'old-value' },
            previous: { nickname: 'old-value' },
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', []]]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        service.mapAttributes(fusionAccount)
        expect(fusionAccount.attributes.nickname).toBe('old-value')
    })
})

describe('AttributeService template evaluation fallback behavior', () => {
    const createServiceWithExpression = (expression: string) => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'computed',
                    expression,
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const createFusionAccount = () => {
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
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

    it('renders unresolved variable literally per standard Velocity semantics', async () => {
        const service = createServiceWithExpression('${firstname}')
        const fusionAccount = createFusionAccount()

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.computed).toBe('${firstname}')
    })

    it('keeps literal expressions that do not reference variables', async () => {
        const service = createServiceWithExpression('static-literal')
        const fusionAccount = createFusionAccount()

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.computed).toBe('static-literal')
    })

    it('renders unresolved expression literally per standard Velocity semantics', async () => {
        const config = {
            attributeMaps: [{ newAttribute: 'computed', existingAttributes: ['computed'], attributeMerge: 'first' }],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'computed',
                    expression: '${firstname}${lastname}',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'computed']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'computed' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                ['HR', [{ computed: '${firstname}${lastname}', source: { name: 'HR' } }]],
            ]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        service.mapAttributes(fusionAccount)
        expect(fusionAccount.attributes.computed).toBe('${firstname}${lastname}')

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.computed).toBe('${firstname}${lastname}')
    })

    it('renders unique definition with unresolved vars literally per standard Velocity semantics', async () => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [
                {
                    name: 'id',
                    expression: '${firstname}${lastname}',
                    useIncrementalCounter: false,
                    normalize: false,
                    spaces: false,
                    trim: true,
                },
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('${firstname}${lastname}')
    })

    it('does not auto-append $counter when unique expression includes $UUID', async () => {
        const uniqueDefinition = {
            name: 'id',
            expression: '$UUID',
            useIncrementalCounter: false,
            normalize: false,
            spaces: false,
            trim: true,
        }
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [uniqueDefinition],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        await service.refreshUniqueAttributes(fusionAccount)

        expect(uniqueDefinition.expression).toBe('$UUID')
        expect(typeof fusionAccount.attributes.id).toBe('string')
        expect(fusionAccount.attributes.id).toHaveLength(36)
    })

    it('recalculates a new UUID on collision for unique expression with $UUID', async () => {
        const uniqueDefinition = {
            name: 'id',
            expression: 'prefix-$UUID',
            useIncrementalCounter: false,
            normalize: false,
            spaces: false,
            trim: true,
        }
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [uniqueDefinition],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        // Force a collision by making the first generated UUID match an already registered one
        const uuidSpy = vi.spyOn(uuid, 'v4')
        let callCount1 = 0
        uuidSpy.mockImplementation(((() => {
            callCount1++
            if (callCount1 === 1) return '11111111-1111-4111-a111-111111111111'
            return '22222222-2222-4222-a222-222222222222'
        }) as any))

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        // Pre-register the first value to force a collision
        service['getUniqueValues']('id').add('prefix-11111111-1111-4111-a111-111111111111')

        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        await service.refreshUniqueAttributes(fusionAccount)

        // The second attempt should generate the second UUID without appending a counter
        expect(fusionAccount.attributes.id).toBe('prefix-22222222-2222-4222-a222-222222222222')
        uuidSpy.mockImplementation((await vi.importActual<typeof import('uuid')>('uuid')).v4)
    })

    it('recalculates a new UUID on collision for unique expression with $UUID when useIncrementalCounter is true', async () => {
        const uniqueDefinition = {
            name: 'id',
            expression: 'prefix-${UUID}-${counter}',
            useIncrementalCounter: true,
            normalize: false,
            spaces: false,
            trim: true,
        }
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [uniqueDefinition],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const uuidSpy = vi.spyOn(uuid, 'v4')
        let callCount2 = 0
        uuidSpy.mockImplementation(((() => {
            callCount2++
            const val = callCount2 === 1 ? '11111111-1111-4111-a111-111111111111' : '22222222-2222-4222-a222-222222222222'
            return val
        }) as any))

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        service['getUniqueValues']('id').add('prefix-11111111-1111-4111-a111-111111111111-1')

        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        await service.initializeCounters()
        await service.refreshUniqueAttributes(fusionAccount)

        // The second attempt should generate the second UUID AND increment the counter
        expect(fusionAccount.attributes.id).toBe('prefix-22222222-2222-4222-a222-222222222222-2')
        uuidSpy.mockImplementation((await vi.importActual<typeof import('uuid')>('uuid')).v4)
    })
})

describe('AttributeService $isUnique in unique attribute expressions', () => {
    const baseLocks = {
        withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
        waitForAllPendingOperations: vi.fn(async () => undefined),
    } as any

    it('picks the else branch when $isUnique is false for a registered value', async () => {
        const uniqueDefinition = {
            name: 'login',
            expression: `#if($isUnique("candidate"))
candidate
#else
fallback
#end`,
            useIncrementalCounter: false,
            normalize: false,
            spaces: false,
            trim: true,
        }
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [uniqueDefinition],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'login']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'login' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const service = new AttributeService(config, schemas, sourceService, log, baseLocks)
        service.registerExistingValues('login', ['candidate'])

        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.login).toBe('fallback')
    })

    it('returns true from $isUnique when the value is not yet registered', async () => {
        const uniqueDefinition = {
            name: 'login',
            expression: `#if($isUnique("fresh"))
fresh
#else
used
#end`,
            useIncrementalCounter: false,
            normalize: false,
            spaces: false,
            trim: true,
        }
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [uniqueDefinition],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'login']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'login' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const service = new AttributeService(config, schemas, sourceService, log, baseLocks)

        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.login).toBe('fresh')
    })
})

describe('AttributeService mainAccount override', () => {
    const createService = () => {
        const config = {
            attributeMaps: [
                {
                    newAttribute: 'id',
                    existingAttributes: ['employeeId'],
                    attributeMerge: 'first',
                },
                {
                    newAttribute: 'name',
                    existingAttributes: ['preferredName'],
                    attributeMerge: 'first',
                },
                {
                    newAttribute: 'nickname',
                    existingAttributes: ['preferredName'],
                    attributeMerge: 'first',
                },
            ],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }, { name: 'ERP' }],
            normalAttributeDefinitions: [
                {
                    name: 'primaryFromAccounts',
                    expression: '$accounts[0].preferredName',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'nickname', 'mainAccount']),
            getSchemaAttributes: vi.fn(() => [
                { name: 'id' },
                { name: 'name' },
                { name: 'nickname' },
                { name: 'mainAccount' },
            ]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const createFusionAccount = (mainAccount?: string, needsReset = false) => {
        const attributeBag = {
            current: mainAccount
                ? { mainAccount, id: 'fusion-id-1', name: 'immutable-name' }
                : { id: 'fusion-id-1', name: 'immutable-name' },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            preferredName: 'Neo',
                            employeeId: 'hr-id-001',
                            _id: 'src-hr::ni-hr',
                            source: { id: 'src-hr', name: 'HR' },
                            schema: { id: 'ni-hr', name: 'Neo' },
                        },
                    ],
                ],
                [
                    'ERP',
                    [
                        {
                            preferredName: 'Trinity',
                            employeeId: 'erp-id-777',
                            _id: 'src-erp::ni-erp',
                            source: { id: 'src-erp', name: 'ERP' },
                            schema: { id: 'ni-erp', name: 'Trinity' },
                        },
                    ],
                ],
            ]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset,
            name: 'neo-1',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR', 'ERP'],
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

    it('uses mainAccount managed account ID as first candidate for first-value mapping', () => {
        const service = createService()
        const fusionAccount = createFusionAccount('src-erp::ni-erp')

        service.mapAttributes(fusionAccount)

        expect(fusionAccount.attributes.nickname).toBe('Trinity')
    })

    it('does not overwrite fusionIdentityAttribute or fusionDisplayAttribute from mapping', () => {
        const service = createService()
        const fusionAccount = createFusionAccount('src-erp::ni-erp')
        fusionAccount.isIdentity = true
        fusionAccount.previousAttributes = { id: 'fusion-id-1', name: 'immutable-name' }

        service.mapAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('fusion-id-1')
        expect(fusionAccount.attributes.name).toBe('immutable-name')
        expect(fusionAccount.attributes.nickname).toBe('Trinity')
    })

    it('allows fusionDisplayAttribute change on reset', () => {
        const service = createService()
        const fusionAccount = createFusionAccount('src-erp::ni-erp', true)
        fusionAccount.isIdentity = true
        fusionAccount.previousAttributes = { id: 'fusion-id-1', name: 'immutable-name' }

        service.mapAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('fusion-id-1')
        expect(fusionAccount.attributes.name).toBe('Trinity')
    })

    it('keeps configured source order when mainAccount is missing or invalid', () => {
        const service = createService()
        const missingOverride = createFusionAccount()
        const invalidOverride = createFusionAccount('missing-id')

        service.mapAttributes(missingOverride)
        service.mapAttributes(invalidOverride)

        expect(missingOverride.attributes.nickname).toBe('Neo')
        expect(invalidOverride.attributes.nickname).toBe('Neo')
    })

    it('places mainAccount managed account at index 0 for definition context', async () => {
        const service = createService()
        const fusionAccount = createFusionAccount('src-erp::ni-erp')

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.primaryFromAccounts).toBe('Trinity')
    })
})

describe('AttributeService mainAccount immediate in-pass effect', () => {
    it('uses newly mapped mainAccount only for subsequent mappings without reordering processing', () => {
        const config = {
            attributeMaps: [
                {
                    newAttribute: 'nicknameBefore',
                    existingAttributes: ['preferredName'],
                    attributeMerge: 'first',
                },
                {
                    newAttribute: 'mainAccount',
                    existingAttributes: ['preferredAccountId'],
                    attributeMerge: 'first',
                },
                {
                    newAttribute: 'nicknameAfter',
                    existingAttributes: ['preferredName'],
                    attributeMerge: 'first',
                },
            ],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }, { name: 'ERP' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            // Keep processing order unchanged: nicknameBefore -> mainAccount -> nicknameAfter
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'nicknameBefore', 'mainAccount', 'nicknameAfter']),
            getSchemaAttributes: vi.fn(() => [
                { name: 'id' },
                { name: 'name' },
                { name: 'nicknameBefore' },
                { name: 'mainAccount' },
                { name: 'nicknameAfter' },
            ]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: { id: 'fusion-id-1', name: 'immutable-name' },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            preferredName: 'Neo',
                            _id: 'src-hr::ni-hr',
                            source: { id: 'src-hr', name: 'HR' },
                            schema: { id: 'ni-hr', name: 'Neo' },
                        },
                    ],
                ],
                [
                    'ERP',
                    [
                        {
                            preferredName: 'Trinity',
                            preferredAccountId: 'src-erp::ni-erp',
                            _id: 'src-erp::ni-erp',
                            source: { id: 'src-erp', name: 'ERP' },
                            schema: { id: 'ni-erp', name: 'Trinity' },
                        },
                    ],
                ],
            ]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'neo-1',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR', 'ERP'],
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

        service.mapAttributes(fusionAccount)

        expect(fusionAccount.attributes.nicknameBefore).toBe('Neo')
        expect(fusionAccount.attributes.mainAccount).toBe('src-erp::ni-erp')
        expect(fusionAccount.attributes.nicknameAfter).toBe('Trinity')
    })
})

describe('AttributeService unique identity reset for managed accounts', () => {
    it('regenerates fusionIdentityAttribute when managed account needs reset', async () => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [
                {
                    name: 'id',
                    expression: 'generated-id',
                    useIncrementalCounter: false,
                    normalize: false,
                    spaces: false,
                    trim: true,
                },
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        const attributeBag = {
            current: { id: 'mapped-id' },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            isManaged: true,
            needsRefresh: true,
            needsReset: true,
            name: 'test-user',
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

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('generated-id')
    })
})

describe('AttributeService identity immutability by account lifecycle', () => {
    const createService = () => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [
                {
                    name: 'id',
                    expression: 'generated-id',
                    useIncrementalCounter: false,
                    normalize: false,
                    spaces: false,
                    trim: true,
                },
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const attachAttributesAccessor = (fusionAccount: any, attributeBag: any) => {
        Object.defineProperty(fusionAccount, 'attributes', {
            get: () => attributeBag.current,
            set: (value) => {
                attributeBag.current = value
            },
        })
    }

    it('regenerates id for new identity-origin fusion account when reset is requested', async () => {
        const service = createService()
        const attributeBag = {
            current: { id: 'seed-id' },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'identity',
            needsRefresh: true,
            needsReset: true,
            name: 'new-identity-account',
            sourceName: 'Identities',
            fromIdentity: true,
            isIdentity: true,
            isManaged: false,
            previousAttributes: {},
            sources: ['HR'],
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }

        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('seed-id')
    })

    it('keeps id immutable for existing fusion account attached to identity', async () => {
        const service = createService()
        const attributeBag = {
            current: { id: 'persisted-id' },
            previous: { id: 'persisted-id' },
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: true,
            name: 'existing-attached-account',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            isManaged: false,
            previousAttributes: attributeBag.previous,
            sources: ['HR'],
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }

        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('persisted-id')
    })
})

describe('AttributeService $originAccount and $account Velocity context', () => {
    const velocitySchemas = {
        listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'derived']),
        getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'derived' }]),
        fusionIdentityAttribute: 'id',
        fusionDisplayAttribute: 'name',
    } as any

    const velocityDeps = () => ({
        sourceService: {} as any,
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        locks: {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any,
    })

    const velocityConfig = (expression: string, sourceList: { name: string }[]) =>
        ({
            attributeMaps: [],
            attributeMerge: 'first',
            sources: sourceList,
            normalAttributeDefinitions: [
                {
                    name: 'derived',
                    expression,
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        }) as any

    const attachAttributesAccessor = (fusionAccount: any, attributeBag: any) => {
        Object.defineProperty(fusionAccount, 'attributes', {
            get: () => attributeBag.current,
            set: (value: any) => {
                attributeBag.current = value
            },
        })
    }

    it('exposes managed account fields on $account for non-Identities origin', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$account.preferredName', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            preferredName: 'FromHR',
                            _id: 'src-hr::native-m1',
                            schema: { name: 'FromHR', id: 'native-m1' },
                            source: { id: 'src-hr', name: 'HR' },
                        },
                    ],
                ],
            ]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'x',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            originSource: 'HR',
            originAccountId: 'src-hr::native-m1',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('FromHR')
    })

    it('exposes origin key via $originAccount and display name on $account for Velocity', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$originAccount:$account.schema.name', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            _id: 'src-h42::managed-42',
                            schema: { name: 'Contoso Smith', id: 'managed-42' },
                            source: { id: 'src-h42', name: 'HR' },
                            IIQDisabled: false,
                        },
                    ],
                ],
            ]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'x',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            originSource: 'HR',
            originAccountId: 'src-h42::managed-42',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('src-h42::managed-42:Contoso Smith')
    })

    it('uses origin managed $account when originSource is Identities and managed origin snapshot exists', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$account.employeeNumber', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: { employeeNumber: 'E-ID' },
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            employeeNumber: 'E-MANAGED',
                            _id: 'src-h::same-id',
                            schema: { name: 'managed', id: 'same-id' },
                            source: { id: 'src-h', name: 'HR' },
                        },
                    ],
                ],
            ]),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'y',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            sources: ['HR', 'Identities'],
            originSource: 'Identities',
            originAccountId: 'src-h::same-id',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('E-MANAGED')
    })

    it('keeps $account undefined when originSource is Identities and origin snapshot is missing', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$account.employeeNumber', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: { employeeNumber: 'E-ID' },
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'y',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            sources: ['Identities'],
            originSource: 'Identities',
            originAccountId: 'id-only',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('$account.employeeNumber')
    })

    it('keeps $account undefined when origin is Identities and identity bag is empty', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$account.source.name$account.schema.id', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'z',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            sources: ['Identities'],
            originSource: 'Identities',
            originAccountId: 'id-only',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('$account.source.name$account.schema.id')
    })

    it('does not resolve managed $account by transient account.id fallback', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$account.employeeNumber', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: { employeeNumber: 'E-ID' },
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([
                [
                    'HR',
                    [
                        {
                            employeeNumber: 'E-MANAGED',
                            _id: 'legacy-row-id',
                            schema: { name: 'managed', id: 'managed-42' },
                            source: { id: 'src-h42', name: 'HR' },
                        },
                    ],
                ],
            ]),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'y',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            sources: ['HR', 'Identities'],
            originSource: 'Identities',
            originAccountId: 'legacy-row-id',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('$account.employeeNumber')
    })

    it('does not synthesize identity-backed schema values when origin snapshot is missing', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$account.schema.name:$account.schema.id', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: { name: 'Fusion Name', id: 'Fusion ID' },
            previous: {},
            identity: { name: 'Identity Name', id: 'Identity ID', displayName: 'Identity Display Name' },
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'y',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            sources: ['Identities'],
            originSource: 'Identities',
            originAccountId: 'id-only',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('$account.schema.name:$account.schema.id')
    })

    it('keeps schema-name expressions undefined when identity origin snapshot is missing', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('$account.schema.name', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: { name: 'Identity Name', displayName: 'Identity Display Name' },
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'y',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            sources: ['Identities'],
            originSource: 'Identities',
            originAccountId: 'id-only',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('$account.schema.name')
    })

    it('uses $originAccount id string in expressions', async () => {
        const { sourceService, log, locks } = velocityDeps()
        const service = new AttributeService(
            velocityConfig('prefix-$originAccount', [{ name: 'HR' }]),
            velocitySchemas,
            sourceService,
            log,
            locks
        )
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>(),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'a',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            originSource: 'HR',
            originAccountId: 'acc-99',
            disabled: false,
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBe('prefix-acc-99')
    })
})

describe('AttributeService unique value registration', () => {
    it('registers existing non-empty unique values', async () => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [
                {
                    name: 'id',
                    expression: '$account.id',
                    useIncrementalCounter: false,
                    normalize: false,
                    spaces: false,
                    trim: true,
                },
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)

        const attributeBag = {
            current: { id: 'persisted-id-1' },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }

        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: false,
            needsReset: false,
            name: 'persisted-user',
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

        await service.registerUniqueAttributes(fusionAccount)

        const uniqueValues = (service as any).uniqueValuesByAttribute.get('id') as Set<string>
        expect(uniqueValues.has('persisted-id-1')).toBe(true)
    })
})

describe('AttributeService fusion identity/display safe defaults when undefined', () => {
    const fusionSchemas = {
        listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'nickname']),
        getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'nickname' }]),
        fusionIdentityAttribute: 'id',
        fusionDisplayAttribute: 'name',
    } as any

    const attachAttributesAccessor = (fusionAccount: any, attributeBag: any) => {
        Object.defineProperty(fusionAccount, 'attributes', {
            get: () => attributeBag.current,
            set: (value: any) => {
                attributeBag.current = value
            },
        })
    }

    const baseDeps = () => ({
        sourceService: {} as any,
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        locks: {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any,
    })

    it('normal definition on fusion identity falls back to a generated UUID when originAccountId is absent', async () => {
        const { sourceService, log, locks } = baseDeps()
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'id',
                    expression: '$!noSuchVar',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const service = new AttributeService(config, fusionSchemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'acct-slug',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            originAccountId: 'src-hr::native-1',
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('normal definition on fusion identity falls back to a generated UUID when only attributes.originAccount is set', async () => {
        const { sourceService, log, locks } = baseDeps()
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'id',
                    expression: '$!noSuchVar',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const service = new AttributeService(config, fusionSchemas, sourceService, log, locks)
        const attributeBag = {
            current: { originAccount: 'from-attrs-only' },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'acct-slug',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('normal definition on fusion display falls back to fusion account name', async () => {
        const { sourceService, log, locks } = baseDeps()
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'name',
                    expression: '$!noSuchVar',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const service = new AttributeService(config, fusionSchemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'managed-display-name',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            originAccountId: 'src-hr::x',
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.name).toBe('managed-display-name')
    })

    it('unique definitions on fusion identity/display use the same fallbacks', async () => {
        const { sourceService, log, locks } = baseDeps()
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [
                {
                    name: 'id',
                    expression: '$!noSuchVar',
                    useIncrementalCounter: false,
                    normalize: false,
                    spaces: false,
                    trim: true,
                },
                {
                    name: 'name',
                    expression: '$!noSuchVar',
                    useIncrementalCounter: false,
                    normalize: false,
                    spaces: false,
                    trim: true,
                },
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const service = new AttributeService(config, fusionSchemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: true,
            name: 'unique-fallback-display',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            originAccountId: 'src-hr::uniq-origin',
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshUniqueAttributes(fusionAccount)
        expect(fusionAccount.attributes.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        expect(fusionAccount.attributes.name).toBe('unique-fallback-display')
    })

    it('still clears non-fusion attributes when the template is undefined', async () => {
        const { sourceService, log, locks } = baseDeps()
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'nickname',
                    expression: '$!noSuchVar',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const service = new AttributeService(config, fusionSchemas, sourceService, log, locks)
        const attributeBag = {
            current: { nickname: 'stale' },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'x',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            sources: ['HR'],
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.nickname).toBeUndefined()
    })

    it('fromIdentity display attribute still prefers hosting identity name over fallbacks', async () => {
        const { sourceService, log, locks } = baseDeps()
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'name',
                    expression: '$!noSuchVar',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const service = new AttributeService(config, fusionSchemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: { name: 'Hosting Identity Name' },
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'fusion-account-slug',
            sourceName: 'Fusion',
            fromIdentity: true,
            isIdentity: true,
            identityName: 'Hosting Identity Name',
            sources: ['HR'],
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        service.applyDisplayAttributeOverride(fusionAccount)
        expect(fusionAccount.attributes.name).toBe('Hosting Identity Name')
    })

    it('correlated display attribute aligns with hosting identity name even when normalDefinitions is empty', async () => {
        const { sourceService, log, locks } = baseDeps()
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const service = new AttributeService(config, fusionSchemas, sourceService, log, locks)
        const attributeBag = {
            current: {},
            previous: {},
            identity: { name: 'Hosting Identity Name Correlated' },
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'fusion',
            needsRefresh: true,
            needsReset: false,
            name: 'fusion-account-slug',
            sourceName: 'Fusion',
            fromIdentity: false,
            isIdentity: true,
            identityName: 'Hosting Identity Name Correlated',
            sources: ['HR'],
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        service.applyDisplayAttributeOverride(fusionAccount)
        expect(fusionAccount.attributes.name).toBe('Hosting Identity Name Correlated')
    })
})

describe('AttributeService error handling', () => {
    const createService = () => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [
                {
                    name: 'normalAttr',
                    expression: '$something',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    refresh: true,
                },
            ],
            uniqueAttributeDefinitions: [
                {
                    name: 'uniqueAttr',
                    expression: '$something',
                    case: 'same',
                    normalize: false,
                    spaces: false,
                    trim: true,
                    maxIterations: 10,
                },
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any

        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const attachAttributesAccessor = (fusionAccount: any, attributeBag: any) => {
        Object.defineProperty(fusionAccount, 'attributes', {
            get: () => attributeBag.current,
            set: (value) => {
                attributeBag.current = value
            },
        })
    }

    const createFusionAccount = (attrs: Record<string, any> = {}) => {
        const attributeBag: any = {
            current: { ...attrs },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map(),
            primaryAccount: {
                id: '123',
                name: '123',
                identityId: 'ident123',
                sourceId: 'hr-source',
                sourceName: 'HR',
                attributes: {},
                entitlements: [],
                disabled: false,
                locked: false,
                privileged: false,
                manuallyCorrelated: false,
                hasEntitlements: false,
                created: '2020-01-01T00:00:00Z',
                modified: '2020-01-01T00:00:00Z',
                uncorrelated: false,
            },
        }

        const fusionAccount: any = {
            id: 'fusion-1',
            name: 'John Doe',
            sourceName: 'IdentityFusion',
            attributes: { ...attrs },
            history: [],
            importHistory: vi.fn(),
            attributeBag,
        }

        attachAttributesAccessor(fusionAccount, attributeBag)

        return fusionAccount
    }

    it('catches and logs errors when generating normal attributes without re-throwing', async () => {
        const service = createService()
        const fusionAccount = createFusionAccount()

        const logErrorSpy = vi.spyOn((service as any).log, 'error')

        // Mock processNormalDefinition to throw
        ;(service as any).processNormalDefinition = vi.fn().mockRejectedValue(new Error('Test normal error'))

        // Mock processUniqueDefinition to succeed
        ;(service as any).processUniqueDefinition = vi.fn().mockResolvedValue(undefined)

        // Should not throw
        await expect(service.refreshAllAttributes(fusionAccount)).resolves.not.toThrow()

        expect(logErrorSpy).toHaveBeenCalledWith(
            'Error generating normal attribute normalAttr for account: John Doe (IdentityFusion)',
            'Test normal error'
        )
    })

    it('catches, logs, and re-throws errors when generating unique attributes', async () => {
        const service = createService()
        const fusionAccount = createFusionAccount()

        const logErrorSpy = vi.spyOn((service as any).log, 'error')

        // Mock processNormalDefinition to succeed
        ;(service as any).processNormalDefinition = vi.fn().mockResolvedValue(undefined)

        // Mock processUniqueDefinition to throw
        ;(service as any).processUniqueDefinition = vi.fn().mockRejectedValue(new Error('Test unique error'))

        await expect(service.refreshAllAttributes(fusionAccount)).rejects.toThrow('Test unique error')

        expect(logErrorSpy).toHaveBeenCalledWith(
            'Error generating unique attribute uniqueAttr for account: John Doe (IdentityFusion)',
            'Test unique error'
        )
    })
})

describe('AttributeService maxLength ordering after post-processing transforms', () => {
    const buildService = (def: any) => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: def.normalAttributeDefinitions ?? [],
            uniqueAttributeDefinitions: def.uniqueAttributeDefinitions ?? [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name', 'nickname']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'nickname' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any
        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any
        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const buildFusionAccount = (attrs: Record<string, any>) => {
        const attributeBag = {
            current: { ...attrs },
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type: 'managed',
            needsRefresh: true,
            needsReset: false,
            name: 'test',
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

    it('applies maxLength after trim for a normal definition (final value is exactly maxLength chars)', async () => {
        const service = buildService({
            normalAttributeDefinitions: [
                {
                    name: 'nickname',
                    expression: '  hello world  ',
                    trim: true,
                    maxLength: 5,
                    refresh: true,
                },
            ],
        })
        const fusionAccount = buildFusionAccount({})

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.nickname).toBe('hello')
        expect(fusionAccount.attributes.nickname.length).toBe(5)
    })

    it('applies maxLength after trim for a unique definition (final value is exactly maxLength chars)', async () => {
        const service = buildService({
            uniqueAttributeDefinitions: [
                {
                    name: 'id',
                    expression: '  hello world  ',
                    useIncrementalCounter: false,
                    trim: true,
                    maxLength: 5,
                },
            ],
        })
        const fusionAccount = buildFusionAccount({})

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('hello')
        expect(fusionAccount.attributes.id.length).toBe(5)
    })

    it('applies maxLength after case for a normal definition', async () => {
        const service = buildService({
            normalAttributeDefinitions: [
                {
                    name: 'nickname',
                    expression: 'ABCDEF',
                    case: 'lower',
                    maxLength: 5,
                    refresh: true,
                },
            ],
        })
        const fusionAccount = buildFusionAccount({})

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.nickname).toBe('abcde')
        expect(fusionAccount.attributes.nickname.length).toBe(5)
    })

    it('applyOutputTransforms produces the same result for the same definition and raw input', async () => {
        const definition: any = {
            name: 'login',
            expression: '$firstName.$lastName$counter',
            useIncrementalCounter: false,
            trim: true,
            case: 'lower',
            spaces: true,
            normalize: false,
            maxLength: 10,
        }
        const context = { firstName: '  John ', lastName: ' Doe ', counter: '01' }
        const { applyOutputTransforms } = await import('../templateEvaluator')
        const transformsResult = applyOutputTransforms(
            '  John . Doe 01',
            definition,
            definition.expression,
            context
        )
        expect(transformsResult).toBe('john.doe01')
    })
})

describe('AttributeService refreshUniqueAttributes early skip rules', () => {
    const buildService = (def: any) => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: def.normalAttributeDefinitions ?? [],
            uniqueAttributeDefinitions: def.uniqueAttributeDefinitions ?? [
                {
                    name: 'id',
                    expression: 'generated-id',
                    useIncrementalCounter: false,
                    normalize: false,
                    spaces: false,
                    trim: true,
                }
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any
        const schemas = {
            listSchemaAttributeNames: vi.fn(() => ['id', 'name']),
            getSchemaAttributes: vi.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any
        const sourceService = {} as any
        const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        const locks = {
            withLock: vi.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: vi.fn(async () => undefined),
        } as any
        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const buildFusionAccount = (type: any, isMatch: boolean, needsReset: boolean) => {
        const attributeBag = {
            current: {},
            previous: {},
            identity: {},
            accounts: [],
            sources: new Map<string, Record<string, any>[]>([['HR', [{ source: { name: 'HR' } }]]]),
        }
        const fusionAccount: any = {
            type,
            needsRefresh: true,
            needsReset,
            name: 'test',
            sourceName: 'HR',
            fromIdentity: false,
            isIdentity: false,
            isMatch,
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

    it('skips unique attributes when it proceeds from an assignment decision', async () => {
        const service = buildService({})
        // type = 'decision', isMatch = false, needsReset = false (assignment decision)
        const fusionAccount = buildFusionAccount('decision', false, false)

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBeUndefined()
    })

    it('does not skip unique attributes when it proceeds from an identity decision', async () => {
        const service = buildService({})
        // type = 'decision', isMatch = false, needsReset = true (identity decision)
        const fusionAccount = buildFusionAccount('decision', false, true)

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('generated-id')
    })

    it('skips unique attributes when it yields a Fusion form to be reviewed (isMatch is true)', async () => {
        const service = buildService({})
        // type = 'managed', isMatch = true, needsReset = false
        const fusionAccount = buildFusionAccount('managed', true, false)

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBeUndefined()
    })

    it('does not skip unique attributes for standard uncorrelated managed accounts that are non-matches', async () => {
        const service = buildService({})
        // type = 'managed', isMatch = false, needsReset = false
        const fusionAccount = buildFusionAccount('managed', false, false)

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('generated-id')
    })
})

