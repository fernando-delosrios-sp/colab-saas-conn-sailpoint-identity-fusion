import { AttributeService } from '../attributeService'

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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'mainAccount']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'mainAccount' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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

describe('AttributeService incremental counter seeding', () => {
    const createService = () => {
        const config = {
            attributeMaps: [],
            attributeMerge: 'first',
            sources: [{ name: 'HR' }],
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [
                {
                    name: 'id',
                    expression: 'NG$counter',
                    useIncrementalCounter: true,
                    digits: 3,
                    counterStart: 1,
                },
            ],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
        } as any

        const schemas = {
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = { fusionSourceId: 'src-1', patchSourceConfig: jest.fn() } as any
        const log = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
        } as any

        const service = new AttributeService(config, schemas, sourceService, log, locks)
        service.setStateWrapper({})
        return service
    }

    const createFusionAccount = (attrs: Record<string, any>) => {
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
            sources: ['HR'],
            history: [],
            importHistory: jest.fn(),
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

    it('seeds the persistent counter from existing incremental values to avoid burning through collisions', async () => {
        const service = createService()
        await service.initializeCounters()

        const existing = createFusionAccount({ id: 'NG015' })
        await service.refreshUniqueAttributes(existing)

        expect(await service.getStateObject()).toEqual({ id: 15 })

        const next = createFusionAccount({})
        await service.refreshUniqueAttributes(next)

        expect(next.attributes.id).toBe('NG016')
        expect(await service.getStateObject()).toEqual({ id: 16 })
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'nickname']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'nickname' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'nickname']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'nickname' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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

    it('returns undefined when unresolved variable expression is rendered unchanged', async () => {
        const service = createServiceWithExpression('${firstname}')
        const fusionAccount = createFusionAccount()

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.computed).toBeUndefined()
    })

    it('keeps literal expressions that do not reference variables', async () => {
        const service = createServiceWithExpression('static-literal')
        const fusionAccount = createFusionAccount()

        await service.refreshNormalAttributes(fusionAccount)

        expect(fusionAccount.attributes.computed).toBe('static-literal')
    })

    it('clears attribute when unresolved expression was previously set by mapping', async () => {
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'computed']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'computed' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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

        expect(fusionAccount.attributes.computed).toBeUndefined()
    })

    it('returns undefined for unique definition with unresolved vars when $counter is auto-appended', async () => {
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
            attributeBag,
        }

        Object.defineProperty(fusionAccount, 'attributes', {
            get: () => attributeBag.current,
            set: (value) => {
                attributeBag.current = value
            },
        })

        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBeUndefined()
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
})

describe('AttributeService $isUnique in unique attribute expressions', () => {
    const baseLocks = {
        withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
        waitForAllPendingOperations: jest.fn(async () => undefined),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'login']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'login' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'login']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'login' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'nickname', 'mainAccount']),
            getSchemaAttributes: jest.fn(() => [
                { name: 'id' },
                { name: 'name' },
                { name: 'nickname' },
                { name: 'mainAccount' },
            ]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
        } as any

        return new AttributeService(config, schemas, sourceService, log, locks)
    }

    const createFusionAccount = (mainAccount?: string, needsReset = false) => {
        const attributeBag = {
            current: mainAccount ? { mainAccount, id: 'fusion-id-1', name: 'immutable-name' } : { id: 'fusion-id-1', name: 'immutable-name' },
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'nicknameBefore', 'mainAccount', 'nicknameAfter']),
            getSchemaAttributes: jest.fn(() => [
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
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
            attributeBag,
        }

        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('generated-id')
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
            importHistory: jest.fn(),
            attributeBag,
        }

        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshUniqueAttributes(fusionAccount)

        expect(fusionAccount.attributes.id).toBe('persisted-id')
    })
})

describe('AttributeService $originAccount and $account Velocity context', () => {
    const velocitySchemas = {
        listSchemaAttributeNames: jest.fn(() => ['id', 'name', 'derived']),
        getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }, { name: 'derived' }]),
        fusionIdentityAttribute: 'id',
        fusionDisplayAttribute: 'name',
    } as any

    const velocityDeps = () => ({
        sourceService: {} as any,
        log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
        locks: {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
            importHistory: jest.fn(),
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
            importHistory: jest.fn(),
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
            importHistory: jest.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBeUndefined()
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
            importHistory: jest.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBeUndefined()
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
            importHistory: jest.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBeUndefined()
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
            importHistory: jest.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBeUndefined()
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
            importHistory: jest.fn(),
            attributeBag,
        }
        attachAttributesAccessor(fusionAccount, attributeBag)
        await service.refreshNormalAttributes(fusionAccount)
        expect(fusionAccount.attributes.derived).toBeUndefined()
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
            importHistory: jest.fn(),
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
            listSchemaAttributeNames: jest.fn(() => ['id', 'name']),
            getSchemaAttributes: jest.fn(() => [{ name: 'id' }, { name: 'name' }]),
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
        } as any

        const sourceService = {} as any
        const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
        const locks = {
            withLock: jest.fn(async (_key: string, fn: () => Promise<any>) => await fn()),
            waitForAllPendingOperations: jest.fn(async () => undefined),
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
            importHistory: jest.fn(),
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
