import { Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from '../fusionAccount'
import { FusionConfig } from '../config'

const minimalConfig = {
    sources: [
        { name: 'Source A', id: 'src-a', type: 'authoritative' },
        { name: 'Source B', id: 'src-b', type: 'record' },
    ],
    fusionAccountRefreshThresholdInSeconds: 3600,
    maxHistoryMessages: 50,
    reset: false,
} as unknown as FusionConfig

beforeAll(() => {
    FusionAccount.configure(minimalConfig)
})

describe('FusionAccount.fromIdentity', () => {
    it('sets baseline and Identities on a new identity-origin account', () => {
        const identity: IdentityDocument = {
            id: 'id-1',
            name: 'Test Identity',
            attributes: { email: 'test@example.com' },
        }
        const acc = FusionAccount.fromIdentity(identity)
        expect(acc.fromIdentity).toBe(true)
        expect(acc.statuses).toContain('baseline')
        expect(acc.sources).toContain('Identities')
        expect(acc.originSource).toBe('Identities')
    })
})

describe('FusionAccount.fromFusionAccount', () => {
    const buildAccount = (overrides: Partial<Account> = {}): Account =>
        ({
            nativeIdentity: 'fusion-1',
            id: 'isc-1',
            name: 'Persisted Identity',
            sourceName: 'Identity Fusion NG',
            identityId: 'id-1',
            disabled: false,
            attributes: {
                originSource: 'Identities',
                originAccount: 'id-1',
                accounts: [],
                statuses: ['baseline'],
            },
            ...overrides,
        }) as unknown as Account

    it('preserves baseline and Identities for an identity-origin record that already has baseline', () => {
        const acc = FusionAccount.fromFusionAccount(buildAccount())
        expect(acc.fromIdentity).toBe(true)
        expect(acc.statuses).toContain('baseline')
        expect(acc.sources).toContain('Identities')
    })

    it('re-asserts baseline when the persisted statuses array is missing it (identity-origin)', () => {
        const acc = FusionAccount.fromFusionAccount(
            buildAccount({
                attributes: {
                    originSource: 'Identities',
                    originAccount: 'id-1',
                    accounts: [],
                    statuses: [],
                },
            })
        )
        expect(acc.fromIdentity).toBe(true)
        expect(acc.statuses).toContain('baseline')
        expect(acc.sources).toContain('Identities')
    })

    it('re-asserts baseline when the persisted statuses array has no statuses key at all', () => {
        const acc = FusionAccount.fromFusionAccount(
            buildAccount({
                attributes: {
                    originSource: 'Identities',
                    originAccount: 'id-1',
                    accounts: [],
                },
            })
        )
        expect(acc.fromIdentity).toBe(true)
        expect(acc.statuses).toContain('baseline')
        expect(acc.sources).toContain('Identities')
    })

    it('coexists with orphan when the persisted statuses only carries orphan (identity-origin)', () => {
        const acc = FusionAccount.fromFusionAccount(
            buildAccount({
                attributes: {
                    originSource: 'Identities',
                    originAccount: 'id-1',
                    accounts: [],
                    statuses: ['orphan'],
                },
            })
        )
        expect(acc.fromIdentity).toBe(true)
        expect(acc.statuses).toContain('baseline')
        expect(acc.statuses).toContain('orphan')
        expect(acc.sources).toContain('Identities')
    })

    it('does not add baseline to a non-identity-origin record', () => {
        const acc = FusionAccount.fromFusionAccount(
            buildAccount({
                attributes: {
                    originSource: 'Source A',
                    originAccount: 'src-a::native-1',
                    accounts: [],
                    statuses: [],
                },
            })
        )
        expect(acc.fromIdentity).toBe(false)
        expect(acc.statuses).not.toContain('baseline')
    })

    it('preserves baseline across orphan transition for identity-origin accounts', () => {
        // Simulate the after-addManagedAccountLayer state: an identity-origin account
        // with no managed accounts and the orphan flag. The baseline marker must remain.
        const acc = FusionAccount.fromFusionAccount(
            buildAccount({
                attributes: {
                    originSource: 'Identities',
                    originAccount: 'id-1',
                    accounts: [],
                    statuses: ['baseline', 'orphan'],
                },
            })
        )
        expect(acc.statuses).toContain('baseline')
        expect(acc.statuses).toContain('orphan')
    })
})
