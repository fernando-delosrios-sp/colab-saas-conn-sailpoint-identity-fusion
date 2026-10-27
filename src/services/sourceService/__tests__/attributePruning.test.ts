import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionRun } from '../../../model/fusionRun'
import { FusionConfig, SourceType } from '../../../model/config'
import type { SourceInfo } from '../types'
import { fetchManagedAccounts, type ManagedAccountFetcherDeps } from '../managedAccountFetcher'
import {
    buildReferencedAttributeSet,
    pruneManagedAccountAttributes,
    pruneIdentityDocumentAttributes,
    filterIdentityAccounts,
    CORE_IDENTITY_ATTRIBUTES,
} from '../referencedAttributeSet'

/**
 * Characterization: managed source account attribute pruning at Bulk ingest.
 * Pruning keeps only the referenced attribute set (schema names, mapping inputs,
 * template textual references, match rule attributes) plus system fields.
 */

const schemaAttributeNames = ['email', 'displayName', 'uid', 'lastName']

const baseConfig = {
    attributeMaps: [{ newAttribute: 'email', existingAttributes: ['emp_email', 'mail'] }],
    normalAttributeDefinitions: [
        {
            name: 'displayName',
            expression: "$sources.get('HR')[0].department",
            normalize: false,
            spaces: false,
            trim: false,
            refresh: false,
        },
    ],
    uniqueAttributeDefinitions: [
        {
            name: 'uid',
            expression: '#set($x = $account.employeeNumber)$x',
            normalize: false,
            spaces: false,
            trim: false,
        },
    ],
    matchingConfigs: [{ attribute: 'lastName', algorithm: 'binary' }],
} as unknown as FusionConfig

function makeAccount(attributes: Record<string, unknown>, overrides: Partial<Account> = {}): Account {
    return {
        id: 'isc-acct-1',
        name: 'Account One',
        nativeIdentity: 'native-1',
        sourceId: 'src-1',
        sourceName: 'HR',
        identityId: 'identity-1',
        modified: '2026-01-01T00:00:00.000Z',
        disabled: false,
        attributes,
        ...overrides,
    } as Account
}

function junkAttributes(count: number): Record<string, string> {
    const attrs: Record<string, string> = {}
    for (let i = 0; i < count; i++) {
        attrs[`junkAttr${i}`] = `junk-${i}`
    }
    return attrs
}

function makeSourceInfo(configOverrides: Record<string, unknown> = {}): SourceInfo {
    return {
        id: 'src-1',
        name: 'HR',
        isManaged: true,
        sourceType: SourceType.Authoritative,
        config: { name: 'HR', ...configOverrides } as any,
    }
}

function makeFetcherDeps(
    accounts: Account[],
    options: { referencedAttributeSet?: ReadonlySet<string>; recordMode?: boolean; sourceConfig?: Record<string, unknown> } = {}
): { deps: ManagedAccountFetcherDeps; run: FusionRun } {
    const run = new FusionRun(
        undefined,
        options.recordMode ? ({ recording: { mode: 'record' } } as unknown as FusionConfig) : undefined
    )
    const log: any = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        detail: vi.fn(),
        setFetchPopulationProgress: vi.fn(),
    }
    const source = makeSourceInfo(options.sourceConfig)
    const deps: ManagedAccountFetcherDeps = {
        log,
        run,
        managedSources: [source],
        batchLimitedSourceNames: new Set<string>(),
        batchCumulativeCount: {},
        accountJmespathFiltersBySourceName: new Map(),
        fetchAccountsBySourceIdGenerator: async function* () {
            yield accounts
        },
        ...(options.referencedAttributeSet ? { referencedAttributeSet: options.referencedAttributeSet } : {}),
    }
    return { deps, run }
}

describe('buildReferencedAttributeSet', () => {
    it('unions schema names, mapping inputs, template references, and match rule attributes', () => {
        const set = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)

        expect(set.has('email')).toBe(true) // schema name + mapping target
        expect(set.has('emp_email')).toBe(true) // mapping input
        expect(set.has('mail')).toBe(true) // mapping input
        expect(set.has('department')).toBe(true) // $sources.get('HR')[0].department
        expect(set.has('employeeNumber')).toBe(true) // $account.employeeNumber
        expect(set.has('lastName')).toBe(true) // match rule attribute
        expect(set.has('displayName')).toBe(true) // schema name
        expect(set.has('junkAttr0')).toBe(false)
    })

    it('includes base Fusion schema attribute names', () => {
        const set = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)

        expect(set.has('accounts')).toBe(true)
        expect(set.has('statuses')).toBe(true)
        expect(set.has('history')).toBe(true)
    })

    it('keeps dot, bracket, and quoted Velocity reference styles', () => {
        const config = {
            ...baseConfig,
            normalAttributeDefinitions: [
                {
                    name: 'd1',
                    expression: "$sources.get('AD')[0].department",
                    normalize: false,
                    spaces: false,
                    trim: false,
                    refresh: false,
                },
            ],
            uniqueAttributeDefinitions: [
                {
                    name: 'u1',
                    expression: "$accounts[0]['custom-attr']$account.employeeNumber",
                    normalize: false,
                    spaces: false,
                    trim: false,
                },
            ],
        } as unknown as FusionConfig

        const set = buildReferencedAttributeSet(config, schemaAttributeNames)

        expect(set.has('department')).toBe(true)
        expect(set.has('custom-attr')).toBe(true)
        expect(set.has('employeeNumber')).toBe(true)
    })
})

describe('pruneManagedAccountAttributes', () => {
    it('drops unreferenced attributes and keeps referenced attributes and system fields', () => {
        const set = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)
        const account = makeAccount({ ...junkAttributes(42), emp_email: 'a@b.c', lastName: 'Doe', email: 'a@b.c' })

        const pruned = pruneManagedAccountAttributes(account, set)

        expect(Object.keys(pruned.attributes as object).sort()).toEqual(['email', 'emp_email', 'lastName'])
        expect(pruned.id).toBe('isc-acct-1')
        expect(pruned.nativeIdentity).toBe('native-1')
        expect(pruned.sourceName).toBe('HR')
        expect(pruned.identityId).toBe('identity-1')
        expect(pruned.modified).toBe('2026-01-01T00:00:00.000Z')
        expect(pruned.disabled).toBe(false)
    })

    it('keeps an unmapped attribute whose name matches a Fusion schema attribute (implicit Map merge parity)', () => {
        const set = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)
        const account = makeAccount({ email: 'kept@example.com', nickname: 'dropped' })

        const pruned = pruneManagedAccountAttributes(account, set)

        expect((pruned.attributes as any).email).toBe('kept@example.com')
        expect((pruned.attributes as any).nickname).toBeUndefined()
    })
})

describe('fetchManagedAccounts pruning at Bulk ingest', () => {
    it('registers pruned bodies on the work queue (50 attributes down to referenced + system fields)', async () => {
        const referencedAttributeSet = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)
        const account = makeAccount({
            ...junkAttributes(42),
            emp_email: 'a@b.c',
            mail: 'a@b.c',
            department: 'Engineering',
            employeeNumber: 'E100',
            lastName: 'Doe',
            email: 'a@b.c',
            displayName: 'Account One',
            uid: 'u-1',
        })
        const { deps, run } = makeFetcherDeps([account], { referencedAttributeSet })

        await fetchManagedAccounts(deps)

        expect(run.managedAccountsById.size).toBe(1)
        const registered = run.managedAccountsById.values().next().value as Account
        expect(Object.keys(registered.attributes as object).sort()).toEqual([
            'department',
            'displayName',
            'email',
            'emp_email',
            'employeeNumber',
            'lastName',
            'mail',
            'uid',
        ])
        expect(registered.id).toBe('isc-acct-1')
        expect(registered.nativeIdentity).toBe('native-1')
    })

    it('evaluates the Accounts JMESPath filter on the unpruned body', async () => {
        const referencedAttributeSet = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)
        const kept = makeAccount({ ...junkAttributes(1), junkFilterAttr: 'keep', lastName: 'Doe' })
        const dropped = makeAccount(
            { junkFilterAttr: 'drop', lastName: 'Smith' },
            { id: 'isc-acct-2', nativeIdentity: 'native-2' }
        )
        const { deps, run } = makeFetcherDeps([kept, dropped], {
            referencedAttributeSet,
            sourceConfig: { accountJmespathFilter: 'accounts[?attributes.junkFilterAttr == `keep`]' },
        })

        await fetchManagedAccounts(deps)

        expect(run.managedAccountsById.size).toBe(1)
        const registered = run.managedAccountsById.values().next().value as Account
        expect(registered.nativeIdentity).toBe('native-1')
        expect((registered.attributes as any).junkFilterAttr).toBeUndefined()
        expect((registered.attributes as any).lastName).toBe('Doe')
    })

    it('discards machine accounts before pruning', async () => {
        const referencedAttributeSet = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)
        const machine = makeAccount({ lastName: 'Robot' }, { isMachine: true })
        const { deps, run } = makeFetcherDeps([machine], { referencedAttributeSet })

        await fetchManagedAccounts(deps)

        expect(run.managedAccountsById.size).toBe(0)
    })

    it('prunes at registration in record mode (client-layer capture stays raw)', async () => {
        const referencedAttributeSet = buildReferencedAttributeSet(baseConfig, schemaAttributeNames)
        const account = makeAccount({ ...junkAttributes(4), lastName: 'Doe' })
        const { deps, run } = makeFetcherDeps([account], { referencedAttributeSet, recordMode: true })

        await fetchManagedAccounts(deps)

        expect(run.isRecordMode).toBe(true)
        const registered = run.managedAccountsById.values().next().value as Account
        expect(Object.keys(registered.attributes as object)).toEqual(['lastName'])
    })

    it('leaves bodies untouched when the referenced attribute set is not initialized (single-account operations)', async () => {
        const account = makeAccount({ ...junkAttributes(4), lastName: 'Doe' })
        const { deps, run } = makeFetcherDeps([account])

        await fetchManagedAccounts(deps)

        const registered = run.managedAccountsById.values().next().value as Account
        expect(Object.keys(registered.attributes as object).sort()).toEqual(
            ['junkAttr0', 'junkAttr1', 'junkAttr2', 'junkAttr3', 'lastName'].sort()
        )
    })
})

describe('pruneIdentityDocumentAttributes', () => {
    it('drops unreferenced attributes while preserving referenced and core fields', () => {
        const identity: IdentityDocument = {
            id: 'id-123',
            name: 'john.doe',
            displayName: 'John Doe',
            email: 'john.doe@example.com',
            attributes: {
                displayName: 'John Doe',
                email: 'john.doe@example.com',
                name: 'john.doe',
                firstname: 'John',
                lastname: 'Doe',
                uid: 'jdoe',
                cloudLifecycleState: 'active',
                department: 'Engineering',
                unreferencedCustomAttr1: 'secret-1',
                unreferencedCustomAttr2: 'secret-2',
            },
        }

        const referencedSet = new Set(['department'])
        pruneIdentityDocumentAttributes(identity, referencedSet)

        expect(identity.attributes).toEqual({
            displayName: 'John Doe',
            email: 'john.doe@example.com',
            name: 'john.doe',
            firstname: 'John',
            lastname: 'Doe',
            uid: 'jdoe',
            cloudLifecycleState: 'active',
            department: 'Engineering',
        })
    })

    it('preserves all core identity attributes even when referenced set is empty', () => {
        const identity: IdentityDocument = {
            id: 'id-456',
            attributes: {
                id: 'id-456',
                name: 'jane.smith',
                displayName: 'Jane Smith',
                email: 'jane@example.com',
                firstname: 'Jane',
                lastname: 'Smith',
                firstName: 'Jane',
                lastName: 'Smith',
                uid: 'jsmith',
                cloudLifecycleState: 'active',
                randomField: 'dropped',
            },
        }

        expect(CORE_IDENTITY_ATTRIBUTES.has('displayName')).toBe(true)
        expect(CORE_IDENTITY_ATTRIBUTES.has('email')).toBe(true)
        pruneIdentityDocumentAttributes(identity, new Set())

        expect(identity.attributes).toEqual({
            id: 'id-456',
            name: 'jane.smith',
            displayName: 'Jane Smith',
            email: 'jane@example.com',
            firstname: 'Jane',
            lastname: 'Smith',
            firstName: 'Jane',
            lastName: 'Smith',
            uid: 'jsmith',
            cloudLifecycleState: 'active',
        })
    })

    it('returns identity untouched when attributes or referenced set is undefined', () => {
        const idWithoutAttrs: IdentityDocument = { id: 'id-1' }
        expect(pruneIdentityDocumentAttributes(idWithoutAttrs, new Set(['dept']))).toBe(idWithoutAttrs)

        const idWithAttrs: IdentityDocument = { id: 'id-2', attributes: { foo: 'bar' } }
        expect(pruneIdentityDocumentAttributes(idWithAttrs, undefined)).toBe(idWithAttrs)
        expect(idWithAttrs.attributes).toEqual({ foo: 'bar' })
    })
})

describe('filterIdentityAccounts', () => {
    it('keeps only Fusion and managed source accounts and strips extra fields', () => {
        const identity: IdentityDocument = {
            id: 'id-789',
            accounts: [
                {
                    id: 'acc-fusion',
                    name: 'jdoe-fusion',
                    nativeIdentity: 'jdoe-fusion-native',
                    disabled: false,
                    source: { id: 'fusion-source-id', name: 'Fusion' },
                    entitlementCount: 15,
                    authoritative: true,
                    attributes: { temp: 'junk' },
                } as any,
                {
                    id: 'acc-managed',
                    name: 'jdoe-hr',
                    nativeIdentity: 'jdoe-hr-native',
                    disabled: true,
                    source: { id: 'hr-source-id', name: 'HR Source' },
                    entitlementCount: 2,
                } as any,
                {
                    id: 'acc-external-1',
                    name: 'jdoe-aws',
                    nativeIdentity: 'jdoe-aws-native',
                    source: { id: 'aws-source-id', name: 'AWS Cloud' },
                } as any,
                {
                    id: 'acc-external-2',
                    name: 'jdoe-slack',
                    source: { id: 'slack-source-id', name: 'Slack' },
                } as any,
            ],
        }

        filterIdentityAccounts(identity, {
            fusionSourceId: 'fusion-source-id',
            managedSourceNames: new Set(['HR Source']),
        })

        expect(identity.accounts).toEqual([
            {
                id: 'acc-fusion',
                nativeIdentity: 'jdoe-fusion-native',
                name: 'jdoe-fusion',
                disabled: false,
                source: { id: 'fusion-source-id', name: 'Fusion' },
            },
            {
                id: 'acc-managed',
                nativeIdentity: 'jdoe-hr-native',
                name: 'jdoe-hr',
                disabled: true,
                source: { id: 'hr-source-id', name: 'HR Source' },
            },
        ])
    })

    it('handles identity with no accounts or undefined accounts safely', () => {
        const identity: IdentityDocument = { id: 'id-no-acc' }
        filterIdentityAccounts(identity, {
            fusionSourceId: 'fusion-1',
            managedSourceNames: new Set(['HR']),
        })
        expect(identity.accounts).toBeUndefined()
    })
})
