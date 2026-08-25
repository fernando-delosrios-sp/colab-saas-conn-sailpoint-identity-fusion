import { IdentityDocument } from 'sailpoint-api-client'
import { FusionConfig } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'
import { ClientService } from '../clientService'
import { LogService } from '../logService'
import { SourceService } from '../sourceService'
import { IdentityService } from '../identityService'
import type { Mock } from 'vitest'

type ClientServiceStub = Pick<ClientService, 'call' | 'paginateSearchApiGenerator'>
type SourceServiceStub = Pick<SourceService, 'resolveIscAccountIdForManagedKey'>

function makeIdentity(id: string, overrides: Partial<IdentityDocument> = {}): IdentityDocument {
    return {
        id,
        name: id,
        attributes: {},
        accounts: [],
        ...overrides,
    } as unknown as IdentityDocument
}

function makeClient(searchResultsByQuery: Record<string, IdentityDocument[]> = {}): ClientServiceStub {
    return {
        call: vi.fn(async (_fn: any, policy?: any) => {
            if (policy?.paginate?.mode === 'searchAfter') {
                const key = policy.paginate.search?.query?.query ?? ''
                return searchResultsByQuery[key] ?? []
            }
            return _fn({ search: { searchPost: vi.fn() } })
        }),
        paginateSearchApiGenerator: vi.fn(async function* (
            search: any,
            _priority,
            _context,
            _abortSignal,
            onPageProgress
        ) {
            const items = searchResultsByQuery[search?.query?.query ?? ''] ?? []
            const pageSize = 250
            for (let start = 0; start < items.length; start += pageSize) {
                const page = items.slice(start, start + pageSize)
                onPageProgress?.(start + page.length, items.length)
                yield page
            }
        }),
    } as unknown as ClientServiceStub
}

function makeLog(): LogService {
    return {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        detail: vi.fn(),
        setProgress: vi.fn(),
        setFetchPopulationProgress: vi.fn(),
        assert: vi.fn(),
        getLogLevel: vi.fn().mockReturnValue('info'),
        recordCorrelationActivity: vi.fn(),
        recordCorrelationCompleted: vi.fn(),
        recordCorrelationSkipped: vi.fn(),
    } as unknown as LogService
}

function makeSources(): SourceServiceStub {
    return {
        resolveIscAccountIdForManagedKey: vi.fn(),
    } as unknown as SourceServiceStub
}

function makeConfig(overrides: Partial<FusionConfig> = {}): FusionConfig {
    return {
        includeIdentities: true,
        identityScopeQuery: '',
        sources: [],
        ...overrides,
    } as unknown as FusionConfig
}

function makeService(
    overrides: {
        config?: Partial<FusionConfig>
        searchResultsByQuery?: Record<string, IdentityDocument[]>
    } = {}
): { service: IdentityService; client: ClientServiceStub; log: LogService } {
    const log = makeLog()
    const client = makeClient(overrides.searchResultsByQuery)
    const sources = makeSources()
    const config = makeConfig(overrides.config)
    const service = new IdentityService(
        config,
        log,
        client as unknown as ClientService,
        sources as unknown as SourceService,
        new FusionRun()
    )
    return { service, client, log }
}

describe('IdentityService.hasIdentityInScope', () => {
    it('returns false for an unknown identity when no fetch has been performed', () => {
        const { service } = makeService()
        expect(service.hasIdentityInScope('id-1')).toBe(false)
    })

    it('returns false for undefined / empty id', () => {
        const { service } = makeService()
        expect(service.hasIdentityInScope(undefined)).toBe(false)
        expect(service.hasIdentityInScope('')).toBe(false)
    })
})

describe('IdentityService.fetchIdentities with identityScopeQuery', () => {
    it('yields during large identity bulk ingest and reports identity population progress', async () => {
        const identities = Array.from({ length: 501 }, (_, index) => makeIdentity(`id-${index}`))
        const { service, log, client } = makeService({
            config: { identityScopeQuery: '*' },
            searchResultsByQuery: { '*': identities },
        })
        ;(client.paginateSearchApiGenerator as Mock).mockImplementation(async function* (
            _search: any,
            _priority: any,
            _context: any,
            _abortSignal: any,
            onPageProgress: any
        ) {
            onPageProgress?.(identities.length, identities.length)
            yield identities
        })
        const setImmediateSpy = vi.spyOn(global, 'setImmediate')

        await service.fetchIdentities()

        expect(setImmediateSpy).toHaveBeenCalledTimes(3)
        expect(log.detail).toHaveBeenCalledWith({ action: 'ingesting identities', count: 501 })
        expect(log.setFetchPopulationProgress).toHaveBeenLastCalledWith('identities', 501, 501)
        expect(log.setProgress).not.toHaveBeenCalled()
        expect(service.hasIdentityInScope('id-500')).toBe(true)
        setImmediateSpy.mockRestore()
    })

    it('omits identity population progress for an empty result', async () => {
        const { service, log } = makeService({
            config: { identityScopeQuery: '*' },
            searchResultsByQuery: { '*': [] },
        })

        await service.fetchIdentities()

        expect(log.setFetchPopulationProgress).not.toHaveBeenCalledWith(
            'identities',
            expect.anything(),
            expect.anything()
        )
        expect(log.detail).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'ingesting identities' }))
    })

    it('omits identity population progress when identity Fetch is skipped', async () => {
        const { service, log } = makeService({
            config: { includeIdentities: false },
        })

        await service.fetchIdentities()

        expect(log.setFetchPopulationProgress).not.toHaveBeenCalled()
        expect(log.info).toHaveBeenCalledWith('Skipping identity fetch.')
    })

    it('marks identities returned by the scope query as in-scope', async () => {
        const { service } = makeService({
            config: { identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                'source.name:Employees': [makeIdentity('id-1'), makeIdentity('id-2')],
            },
        })

        await service.fetchIdentities()

        expect(service.hasIdentityInScope('id-1')).toBe(true)
        expect(service.hasIdentityInScope('id-2')).toBe(true)
        expect(service.hasIdentityInScope('id-3')).toBe(false)
    })

    it('excludes protected identities from the in-scope set', async () => {
        const { service } = makeService({
            config: { identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                'source.name:Employees': [makeIdentity('id-1'), makeIdentity('id-2', { protected: true })],
            },
        })

        await service.fetchIdentities()

        expect(service.hasIdentityInScope('id-1')).toBe(true)
        expect(service.hasIdentityInScope('id-2')).toBe(false)
        // Protected identities from the scope query are dropped from the cache via the sentinel key.
        expect(service.getIdentityById('id-2')).toBeUndefined()
    })
})

describe('IdentityService.isIdentityInScope', () => {
    it('returns true without search when the identity is already in the cached scope set', async () => {
        const { service, client } = makeService({
            config: { identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                'source.name:Employees': [makeIdentity('id-1')],
            },
        })

        await service.fetchIdentities()

        await expect(service.isIdentityInScope('id-1')).resolves.toBe(true)
        expect(client.paginateSearchApiGenerator).toHaveBeenCalledTimes(1)
        expect(client.call).not.toHaveBeenCalled()
    })

    it('returns false without search when fetchIdentities already resolved scope', async () => {
        const { service, client } = makeService({
            config: { identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                'source.name:Employees': [makeIdentity('id-1')],
            },
        })

        await service.fetchIdentities()

        await expect(service.isIdentityInScope('id-out')).resolves.toBe(false)
        expect(client.paginateSearchApiGenerator).toHaveBeenCalledTimes(1)
        expect(client.call).not.toHaveBeenCalled()
    })

    it('uses a targeted scoped search when the scope set has not been loaded', async () => {
        const scopedQuery = 'id:"id-1" AND (source.name:Employees)'
        const { service } = makeService({
            config: { identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                [scopedQuery]: [makeIdentity('id-1')],
            },
        })

        await expect(service.isIdentityInScope('id-1')).resolves.toBe(true)
        await expect(service.isIdentityInScope('id-2')).resolves.toBe(false)
    })

    it('returns true when identity fetching is disabled but the identity is hydrated in cache', async () => {
        const { service, client } = makeService({
            config: { includeIdentities: false, identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                'id:"id-1"': [makeIdentity('id-1')],
            },
        })

        await service.fetchIdentityById('id-1')

        await expect(service.isIdentityInScope('id-1')).resolves.toBe(true)
        expect(client.call).toHaveBeenCalledTimes(1)
    })

    it('uses id-only existence search when identity fetching is disabled and identity is not cached', async () => {
        const { service } = makeService({
            config: { includeIdentities: false, identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                'id:"id-1"': [makeIdentity('id-1')],
            },
        })

        await expect(service.isIdentityInScope('id-1')).resolves.toBe(true)
        await expect(service.isIdentityInScope('id-missing')).resolves.toBe(false)
    })

    it('returns false when no identity scope query is configured', async () => {
        const { service, client } = makeService({
            config: { identityScopeQuery: '' },
        })

        await expect(service.isIdentityInScope('id-1')).resolves.toBe(false)
        expect(client.call).not.toHaveBeenCalled()
    })

    it('returns true for universal scope when the identity is already hydrated in cache', async () => {
        const { service, client } = makeService({
            config: { identityScopeQuery: '*' },
            searchResultsByQuery: {
                'id:"id-1"': [makeIdentity('id-1')],
            },
        })

        await service.fetchIdentityById('id-1')

        await expect(service.isIdentityInScope('id-1')).resolves.toBe(true)
        expect(client.call).toHaveBeenCalledTimes(1)
    })

    it('uses id-only lookup for universal scope instead of id AND (*)', async () => {
        const { service } = makeService({
            config: { identityScopeQuery: '*' },
            searchResultsByQuery: {
                'id:"id-1"': [makeIdentity('id-1')],
            },
        })

        await expect(service.isIdentityInScope('id-1')).resolves.toBe(true)
        await expect(service.isIdentityInScope('id-2')).resolves.toBe(false)
    })
})

describe('IdentityService.resolveOriginIdentityInScope', () => {
    it('returns true without search when includeIdentities is false and identity was just hydrated', async () => {
        const { service, client } = makeService({
            config: { includeIdentities: false, identityScopeQuery: 'source.name:Employees' },
        })
        const hydrated = makeIdentity('id-1')

        await expect(service.resolveOriginIdentityInScope('id-1', hydrated)).resolves.toBe(true)
        expect(client.call).not.toHaveBeenCalled()
    })

    it('falls back to scoped search when includeIdentities is enabled', async () => {
        const scopedQuery = 'id:"id-1" AND (source.name:Employees)'
        const { service } = makeService({
            config: { includeIdentities: true, identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                [scopedQuery]: [makeIdentity('id-1')],
            },
        })

        await expect(service.resolveOriginIdentityInScope('id-1')).resolves.toBe(true)
    })
})

describe('IdentityService.ensureIdentityById', () => {
    it('returns cached identity without API calls', async () => {
        const owner = makeIdentity('owner-cached')
        const { service, client } = makeService()
        service.run.addIdentity(owner.id!, owner)

        const result = await service.ensureIdentityById('owner-cached')

        expect(result).toBe(owner)
        expect(client.call).not.toHaveBeenCalled()
    })

    it('falls back to profile fetch when search hydration returns nothing', async () => {
        const owner = makeIdentity('owner-profile')
        const { service, client } = makeService()
        ;(client.call as Mock).mockImplementation(async (_fn: any, policy: any) => {
            const context = policy?.context ?? ''
            if (context === 'IdentityService>fetchIdentityProfileById getIdentity') {
                return { id: owner.id, name: owner.name, emailAddress: 'owner@example.com', attributes: {} }
            }
            return []
        })

        const result = await service.ensureIdentityById('owner-profile')

        expect(result?.id).toBe('owner-profile')
        expect(service.getIdentityById('owner-profile')).toBeDefined()
    })
})

describe('IdentityService.fetchIdentities with additionalIdentityIds (global reviewer / source owner)', () => {
    it('marks hydrated additional ids as in-scope for the current aggregation', async () => {
        const owner = makeIdentity('owner-1')
        const { service, client } = makeService()
        ;(client.call as Mock).mockImplementation(async (_fn: any, policy: any) => {
            const context = policy?.context ?? ''
            if (
                context === 'IdentityService>fetchIdentityById searchPost' ||
                context === 'IdentityService>hydrateMissingIdentitiesById searchPost'
            ) {
                return [owner]
            }
            return []
        })

        await service.fetchIdentities(['owner-1'])

        expect(service.hasIdentityInScope('owner-1')).toBe(true)
        expect(service.getIdentityById('owner-1')).toBeDefined()
    })

    it('does not mark additional ids that fail to hydrate as in-scope', async () => {
        const { service, client } = makeService()
        ;(client.call as Mock).mockResolvedValue([])

        await service.fetchIdentities(['owner-missing'])

        expect(service.hasIdentityInScope('owner-missing')).toBe(false)
        expect(service.getIdentityById('owner-missing')).toBeUndefined()
    })

    it('does not mark a protected additional id as in-scope', async () => {
        const protectedOwner = makeIdentity('owner-protected', { protected: true })
        const { service, client } = makeService()
        ;(client.call as Mock).mockImplementation(async (_fn: any, policy: any) => {
            const context = policy?.context ?? ''
            if (
                context === 'IdentityService>fetchIdentityById searchPost' ||
                context === 'IdentityService>hydrateMissingIdentitiesById searchPost'
            ) {
                return [protectedOwner]
            }
            return []
        })

        await service.fetchIdentities(['owner-protected'])

        expect(service.hasIdentityInScope('owner-protected')).toBe(false)
        expect(service.getIdentityById('owner-protected')).toBeDefined()
    })

    it('merges scope-query identities with additional ids in the in-scope set', async () => {
        const scoped = makeIdentity('id-scoped')
        const owner = makeIdentity('owner-1')
        const { service, client } = makeService({
            config: { identityScopeQuery: 'source.name:Employees' },
            searchResultsByQuery: {
                'source.name:Employees': [scoped],
            },
        })
        ;(client.call as Mock).mockImplementation(async (_fn: any, policy: any) => {
            const context = policy?.context ?? ''
            const queryStr = policy?.paginate?.search?.query?.query ?? ''
            if (
                context === 'IdentityService>fetchIdentityById searchPost' ||
                context === 'IdentityService>hydrateMissingIdentitiesById searchPost'
            ) {
                return [owner]
            }
            return queryStr === 'source.name:Employees' ? [scoped] : []
        })

        await service.fetchIdentities(['owner-1'])

        expect(service.hasIdentityInScope('id-scoped')).toBe(true)
        expect(service.hasIdentityInScope('owner-1')).toBe(true)
    })

    it('skips empty / falsy additional ids', async () => {
        const owner = makeIdentity('owner-1')
        const { service, client } = makeService()
        ;(client.call as Mock).mockImplementation(async (_fn: any, policy: any) => {
            const context = policy?.context ?? ''
            if (
                context === 'IdentityService>fetchIdentityById searchPost' ||
                context === 'IdentityService>hydrateMissingIdentitiesById searchPost'
            ) {
                return [owner]
            }
            return []
        })

        await service.fetchIdentities(['', 'owner-1', undefined as unknown as string])

        expect(service.hasIdentityInScope('owner-1')).toBe(true)
        expect(service.hasIdentityInScope('')).toBe(false)
    })
})

describe('IdentityService.fetchIdentityProfileById', () => {
    it('loads emailAddress from identities API into cache', async () => {
        const { service, client } = makeService()
        ;(client.call as Mock).mockImplementation(async (_fn: any, policy: any) => {
            if (policy?.context === 'IdentityService>fetchIdentityProfileById getIdentity') {
                return { id: 'owner-1', name: 'Owner', emailAddress: 'owner@example.com', attributes: {} }
            }
            return []
        })

        const doc = await service.fetchIdentityProfileById('owner-1')

        expect(doc?.email).toBe('owner@example.com')
        expect((doc?.attributes as any)?.email).toBe('owner@example.com')
        expect(service.getIdentityById('owner-1')?.email).toBe('owner@example.com')
    })
})

describe('IdentityService.correlateAccounts', () => {
    function makeFusionAccount(overrides: Record<string, unknown> = {}) {
        return {
            name: 'Test Fusion',
            identityId: 'identity-1',
            missingAccountIds: ['src-hr::acct-1', 'src-hr::acct-2'],
            correlation: {
                markCorrelated: vi.fn(),
                addPromise: vi.fn(),
            },
            ...overrides,
        } as any
    }

    it('records link correlation activity by default', async () => {
        const { service, client } = makeService()
        const log = (service as any).log as LogService
        const sources = (service as any).sources as SourceServiceStub
        ;(sources.resolveIscAccountIdForManagedKey as Mock).mockReturnValue('isc-1')
        ;(client.call as Mock).mockResolvedValue(undefined)

        await service.correlateAccounts(makeFusionAccount(), ['src-hr::acct-1'])

        expect(log.recordCorrelationActivity).toHaveBeenCalledWith({ kind: 'link', accounts: 1 })
        expect(log.recordCorrelationCompleted).toHaveBeenCalledWith({ kind: 'link' })
    })

    it('records merge correlation activity when kind is merge', async () => {
        const { service, client } = makeService()
        const log = (service as any).log as LogService
        const sources = (service as any).sources as SourceServiceStub
        ;(sources.resolveIscAccountIdForManagedKey as Mock).mockReturnValue('isc-1')
        ;(client.call as Mock).mockResolvedValue(undefined)

        await service.correlateAccounts(makeFusionAccount(), ['src-hr::acct-1'], 'merge')

        expect(log.recordCorrelationActivity).toHaveBeenCalledWith({ kind: 'merge', accounts: 1 })
    })

    it('records skip when ISC account id is not found', async () => {
        const { service } = makeService()
        const log = (service as any).log as LogService
        const sources = (service as any).sources as SourceServiceStub
        ;(sources.resolveIscAccountIdForManagedKey as Mock).mockReturnValue(undefined)

        await service.correlateAccounts(makeFusionAccount(), ['src-hr::missing'])

        expect(log.recordCorrelationSkipped).toHaveBeenCalledWith('noIscAccountId')
        expect(log.recordCorrelationActivity).toHaveBeenCalledWith({ kind: 'link', accounts: 1 })
    })
})
