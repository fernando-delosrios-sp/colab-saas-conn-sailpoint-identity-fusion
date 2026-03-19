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
                            _source: 'HR',
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
            sources: new Map<string, Record<string, any>[]>([['HR', [{ _source: 'HR' }]]]),
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
                ['HR', [{ computed: '${firstname}${lastname}', _source: 'HR' }]],
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
            sources: new Map<string, Record<string, any>[]>([['HR', [{ _source: 'HR' }]]]),
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
            sources: new Map<string, Record<string, any>[]>([['HR', [{ _source: 'HR' }]]]),
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
