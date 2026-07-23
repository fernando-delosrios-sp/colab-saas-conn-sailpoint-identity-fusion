import { FusionAccount, IDENTITIES_SOURCE_NAME } from '../fusionAccount'
import { FusionConfig, SourceType } from '../config'
import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionDecision } from '../form'
import { FusionAccountKind } from '../fusionAccountTypes'
import { StatusEntitlement } from '../statusEntitlement'
import { FusionRun } from '../fusionRun'

describe('FusionAccount', () => {
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

    describe('1. Factory Methods', () => {
        it('fromIdentity initializes correctly', () => {
            const identity: IdentityDocument = {
                id: 'id-1',
                name: 'test-identity',
                attributes: { email: 'test@example.com', displayName: 'Test Identity' }
            }
            const acc = FusionAccount.fromIdentity(identity)
            expect(acc.type).toBe(FusionAccountKind.Identity)
            expect(acc.sourceName).toBe(IDENTITIES_SOURCE_NAME)
            expect(acc.statuses).toContain('baseline')
            expect(acc.fromIdentity).toBe(true)
            expect(acc.managedKey).toBe(`${IDENTITIES_SOURCE_NAME}::id-1`)
        })

        it('fromManagedAccount initializes correctly', () => {
            const account: Account = { id: 'isc-acc-1', sourceId: 'src-a', nativeIdentity: 'nat-1', sourceName: 'Source A', attributes: {} } as any
            const acc = FusionAccount.fromManagedAccount(account)
            expect(acc.type).toBe(FusionAccountKind.Managed)
            expect(acc.sourceName).toBe('Source A')
            expect(acc.statuses).toContain('uncorrelated')
            expect(acc.needsReset).toBe(true)
            expect(acc.managedKey).toBe('src-a::nat-1')
        })

        it('fromFusionDecision initializes correctly', () => {
            const decision: FusionDecision = {
                account: { id: 'src-a::native-1', sourceName: 'Source A', sourceId: 'src-a', nativeIdentity: 'native-1' },
                identityId: 'id-1',
                identityName: 'Test Identity',
                newIdentity: true,
                submitter: { name: 'admin' },
                sourceType: SourceType.Authoritative
            } as any
            const acc = FusionAccount.fromFusionDecision(decision)
            expect(acc.type).toBe(FusionAccountKind.Decision)
            expect(acc.managedKey).toBe('src-a::native-1')
            expect(acc.statuses).toContain('uncorrelated')
        })
    })

    describe('2. Attribute bag & layer merging', () => {
        it('addIdentityLayer merges identity layer', () => {
            const identity: IdentityDocument = {
                id: 'id-1',
                name: 'test-identity',
                attributes: { email: 'test@test.com' },
                accounts: [
                    { source: { name: 'Source A', id: 'src-a' }, nativeIdentity: 'native-1' } as any
                ]
            }
            const acc = FusionAccount.fromIdentity(identity)
            acc.addIdentityLayer(identity)
            expect(acc.email).toBe('test@test.com')
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.missingAccountIds).not.toContain('src-a::native-1')
        })

        it('addManagedAccountLayer merges managed account', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            const run = new FusionRun()
            run.managedAccountsById.set('src-a::native-1', { id: 'isc-acc-1', sourceId: 'src-a', nativeIdentity: 'native-1', sourceName: 'Source A', attributes: {} } as any)
            run.managedAccountsByIdentityId.set('id-1', new Set(['src-a::native-1']))
            
            acc.addManagedAccountLayer(run)
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(run.managedAccountsById.size).toBe(0)
        })

        it('addFusionDecisionLayer merges decision layer', () => {
            const decision: FusionDecision = {
                account: { id: 'src-b::nat-2', sourceId: 'src-b', nativeIdentity: 'nat-2', sourceName: 'Source B' },
                newIdentity: true,
                submitter: { name: 'admin' },
                sourceType: SourceType.Authoritative
            } as any
            const acc = FusionAccount.fromFusionDecision(decision)
            acc.addFusionDecisionLayer(decision)
            expect(acc.statuses).toContain('manual')
        })
    })

    describe('3. Status state machine', () => {
        it('addStatus, removeStatus, hasStatus, statuses', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addStatus('testStatus')
            expect(acc.hasStatus('testStatus')).toBe(true)
            expect(acc.statuses).toContain('testStatus')
            acc.removeStatus('testStatus')
            expect(acc.hasStatus('testStatus')).toBe(false)
        })
    })

    describe('4. Action state machine', () => {
        it('addAction, removeAction, actions, setSourceReviewer, removeSourceReviewer, listReviewerSources', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addAction('testAction')
            expect(acc.actions).toContain('testAction')
            acc.removeAction('testAction')
            
            acc.setSourceReviewer('src-a')
            expect(acc.actions).toContain('reviewer:src-a')
            expect(acc.hasStatus('reviewer')).toBe(true)
            expect(acc.listReviewerSources()).toEqual(['src-a'])
            
            acc.removeSourceReviewer('src-a')
            expect(acc.actions).not.toContain('reviewer:src-a')
            expect(acc.hasStatus('reviewer')).toBe(false)
        })
    })

    describe('5. Review tracking', () => {
        it('manages reviews correctly', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addReview('url1')
            expect(acc.reviews).toContain('url1')
            acc.removeReview('url1')
            
            acc.addFusionReview('url2')
            expect(acc.reviews).toContain('url2')
            expect(acc.hasStatus('activeReviews')).toBe(true)
            
            acc.removeFusionReview('url2')
            expect(acc.hasStatus('activeReviews')).toBe(false)
            
            acc.addFusionReview('url3')
            acc.clearFusionReviews()
            expect(acc.reviews.length).toBe(0)
            
            acc.addPendingReviewUrl('url4')
            acc.resolvePendingReviewUrls()
            expect(acc.reviews).toContain('url4')
        })
    })

    describe('6. Account ID management', () => {
        it('adds and removes account ids', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addAccountId('acc-1')
            expect(acc.accountIds).toContain('acc-1')
            acc.removeAccountId('acc-1')
            
            acc.addMissingAccountId('missing-1')
            expect(acc.missingAccountIds).toContain('missing-1')
            acc.removeMissingAccountId('missing-1')
        })
    })

    describe('7. Correlation promises', () => {
        it('handles correlation promises', async () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addMissingAccountId('acc-1')
            acc.setCorrelatedAccount('acc-1', Promise.resolve('ok'))
            expect(acc.accountIds).toContain('acc-1')
            expect(acc.missingAccountIds).not.toContain('acc-1')
            
            await acc.resolvePendingOperations()
        })
    })

    describe('8. State flags', () => {
        it('toggles flags', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.disable()
            expect(acc.disabled).toBe(true)
            acc.enable()
            expect(acc.disabled).toBe(false)
            
            acc.setNeedsRefresh(true)
            expect(acc.needsRefresh).toBe(true)
            
            acc.setNeedsReset(true)
            expect(acc.needsReset).toBe(true)
        })
    })

    describe('9. Collection sync', () => {
        it('syncs collections to attribute bag', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addStatus('status1')
            acc.addAction('action1')
            acc.syncCollectionAttributesToBag()
            expect(acc.attributes.statuses).toContain('status1')
            expect(acc.attributes.actions).toContain('action1')
        })
    })

    describe('10. toISCAccount serialization', () => {
        it('round trips toISCAccount and fromFusionAccount', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1', attributes: { email: 'a@b.com' } } as any)
            acc.setKey({ simple: { id: 'id-1' } })
            acc.addStatus(StatusEntitlement.Baseline)
            acc.syncCollectionAttributesToBag()

            const iscAccount = acc.toISCAccount()
            iscAccount.nativeIdentity = 'id-1'
            iscAccount.id = 'isc-1'

            const restored = FusionAccount.fromFusionAccount(iscAccount)
            expect(restored.statuses).toContain('baseline')
            expect(restored.managedKey).toBe(`id-1`)
        })

        it('round trips the persisted identityId through attributes', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1', attributes: { email: 'a@b.com' } } as any)
            acc.setKey({ simple: { id: 'id-1' } })
            acc.addStatus(StatusEntitlement.Baseline)
            acc.syncCollectionAttributesToBag()

            const iscAccount = acc.toISCAccount()
            iscAccount.nativeIdentity = 'id-1'
            iscAccount.id = 'isc-1'
            // Simulate ISC echo: only attributes + nativeIdentity + id are persisted, no top-level identityId
            iscAccount.attributes = { ...iscAccount.attributes }

            const restored = FusionAccount.fromFusionAccount(iscAccount)
            expect(restored.identityId).toBe('id-1')
            expect(restored.identityIdAttribute).toBe('id-1')
        })

        it('routes via identityIdAttribute fallback when SDK does not expose identityId', () => {
            const persisted = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-attr-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                attributes: { identityId: 'identity-1' },
            } as any)
            // _identityInfo is created from the persisted attribute (not from the SDK Account)
            expect(persisted.identityId).toBe('identity-1')
            expect(persisted.identityIdAttribute).toBe('identity-1')
        })

        it('ignores empty or whitespace-only persisted identityId', () => {
            const persisted = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-empty',
                name: 'Empty ID',
                sourceName: 'Identity Fusion NG',
                attributes: { identityId: '   ' },
            } as any)
            // No identity info was reconstructed; hasValue('') is false so routing is uncorrelated
            expect(persisted.identityId).toBeUndefined()
            expect(persisted.identityIdAttribute).toBeUndefined()
        })

        it('setIdentityIdAttribute trims and stores the id on _identityInfo', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.setIdentityIdAttribute('  identity-42  ')
            expect(acc.identityIdAttribute).toBe('identity-42')
            expect((acc as any)._identityInfo?.id).toBe('identity-42')
            // Empty values are stored as empty string; hasValue returns false
            acc.setIdentityIdAttribute('')
            expect(acc.identityIdAttribute).toBe('')
            expect((acc as any)._identityInfo?.id).toBe('')
        })

        it('preserves name/displayName when setIdentityIdAttribute updates an existing _identityInfo', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1', name: 'Jane Doe' } as any)
            expect((acc as any)._identityInfo?.name).toBeTruthy()
            acc.setIdentityIdAttribute('identity-99')
            expect(acc.identityId).toBe('identity-99')
            expect((acc as any)._identityInfo?.name).toBeTruthy()
        })
    })

    describe('11. History', () => {
        it('imports and caps history', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            const hist = Array.from({ length: 60 }, (_, i) => `[Date] message ${i}`)
            acc.importHistory(hist)
            expect(acc.history.length).toBe(minimalConfig.maxHistoryMessages)
            expect(acc.history[49]).toBe('[Date] message 59')
        })
    })

    describe('12. Fusion matches', () => {
        it('buildIdentityInfo from decision', () => {
            const decision = { account: { sourceId: 'src1', nativeIdentity: 'nat1' }, identityId: 'a1', identityName: 'S1', newIdentity: true } as any
            expect(FusionAccount.buildIdentityInfo(decision)).toEqual({ id: 'a1', name: 'S1', displayName: 'S1' })
        })

        it('adds fusion match', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addFusionMatch({ fusionIdentity: {} as any, score: 100 } as any)
            expect(acc.isMatch).toBe(true)
            expect(acc.fusionMatches.length).toBe(1)
            
            acc.clearFusionIdentityReferences()
            expect((acc.fusionMatches[0] as any).fusionIdentity).toBeUndefined()
        })
    })

    describe('13. buildIdentityInfo', () => {
        it('builds identity info', () => {
            const info = FusionAccount.buildIdentityInfo({ id: 'id-1', name: 'Name', displayName: 'Display Name' } as any)
            expect(info).toEqual({ id: 'id-1', name: 'Name', displayName: 'Display Name' })
        })
    })

    describe('14. Reverse correlation', () => {
        it('sets reverse correlation attribute', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.setReverseCorrelationAttribute('revAttr', 'value')
            expect(acc.attributes['revAttr']).toBe('value')
            acc.clearReverseCorrelationAttribute('revAttr')
            expect(acc.attributes['revAttr']).toBeUndefined()
        })
    })

    describe('15. Identity-origin baseline re-assertion on fromFusionAccount', () => {
        const buildPersistedAccount = (overrides: Record<string, unknown> = {}): Account =>
            ({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                identityId: 'id-1',
                disabled: false,
                attributes: {
                    originSource: IDENTITIES_SOURCE_NAME,
                    originAccount: 'id-1',
                    accounts: [],
                    statuses: ['baseline'],
                    ...overrides,
                },
            }) as unknown as Account

        it('preserves baseline and Identities for a record that already has baseline', () => {
            const acc = FusionAccount.fromFusionAccount(buildPersistedAccount())
            expect(acc.fromIdentity).toBe(true)
            expect(acc.statuses).toContain('baseline')
            expect(acc.sources).toContain(IDENTITIES_SOURCE_NAME)
        })

        it('re-asserts baseline when the persisted statuses array is empty (identity-origin)', () => {
            const acc = FusionAccount.fromFusionAccount(
                buildPersistedAccount({ statuses: [] })
            )
            expect(acc.fromIdentity).toBe(true)
            expect(acc.statuses).toContain('baseline')
            expect(acc.sources).toContain(IDENTITIES_SOURCE_NAME)
        })

        it('re-asserts baseline when the persisted statuses key is missing (identity-origin)', () => {
            const acc = FusionAccount.fromFusionAccount(
                buildPersistedAccount({ statuses: undefined })
            )
            expect(acc.fromIdentity).toBe(true)
            expect(acc.statuses).toContain('baseline')
            expect(acc.sources).toContain(IDENTITIES_SOURCE_NAME)
        })

        it('coexists with orphan when persisted statuses only carries orphan (identity-origin)', () => {
            const acc = FusionAccount.fromFusionAccount(
                buildPersistedAccount({ statuses: ['orphan'] })
            )
            expect(acc.fromIdentity).toBe(true)
            expect(acc.statuses).toContain('baseline')
            expect(acc.statuses).toContain('orphan')
            expect(acc.sources).toContain(IDENTITIES_SOURCE_NAME)
        })

        it('does not add baseline to a non-identity-origin record', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-2',
                id: 'isc-2',
                name: 'Persisted Managed',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    originSource: 'Source A',
                    originAccount: 'src-a::native-1',
                    accounts: [],
                    statuses: [],
                },
            } as unknown as Account)
            expect(acc.fromIdentity).toBe(false)
            expect(acc.statuses).not.toContain('baseline')
            expect(acc.sources).not.toContain(IDENTITIES_SOURCE_NAME)
        })
    })

    describe('16. Missing-accounts restoration from persisted attributes', () => {
        it('restores missing-accounts into the missing reference set', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['src-a::correlated-1'],
                    'missing-accounts': ['src-a::missing-1'],
                },
            } as unknown as Account)
            expect(acc.missingAccountIds).toContain('src-a::missing-1')
            expect(acc.missingAccountIds).not.toContain('src-a::correlated-1')
        })

        it('does not put correlated accounts into the missing reference set', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['src-a::correlated-1'],
                },
            } as unknown as Account)
            expect(acc.missingAccountIds).toEqual([])
        })
    })

    describe('17. Persisted collection and history restoration', () => {
        it('restores previous account IDs from persisted accounts', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['src-a::correlated-1', 'src-b::correlated-2'],
                },
            } as unknown as Account)
            expect((acc as any).previousAccountIds).toContain('src-a::correlated-1')
            expect((acc as any).previousAccountIds).toContain('src-b::correlated-2')
        })

        it('restores history from persisted attributes', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: [],
                    history: ['[2026-01-01] event one', '[2026-01-02] event two'],
                },
            } as unknown as Account)
            expect(acc.history).toContain('[2026-01-01] event one')
            expect(acc.history).toContain('[2026-01-02] event two')
        })
    })

    describe('addManagedAccountLayer identity matching', () => {
        it('claims accounts by identityId index and marks them correlated', () => {
            const identity: IdentityDocument = {
                id: 'id-1',
                name: 'test-identity',
                attributes: {},
            } as any
            const acc = FusionAccount.fromIdentity(identity)

            const account: Account = {
                id: 'isc-acc-1',
                sourceId: 'src-a',
                nativeIdentity: 'native-1',
                sourceName: 'Source A',
                attributes: {},
            } as any
            const run = new FusionRun()
            run.managedAccountsById.set('src-a::native-1', account)
            run.managedAccountsByIdentityId.set('id-1', new Set(['src-a::native-1']))

            acc.addManagedAccountLayer(run)

            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.missingAccountIds).not.toContain('src-a::native-1')
            expect(run.managedAccountsById.size).toBe(0)
            expect(run.managedAccountsByIdentityId.has('id-1')).toBe(false)
        })

        it('claims accounts from previous run via previousAccountIds', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['src-a::native-1'],
                },
            } as unknown as Account)

            const account: Account = {
                id: 'isc-acc-1',
                sourceId: 'src-a',
                nativeIdentity: 'native-1',
                sourceName: 'Source A',
                attributes: {},
            } as any
            const run = new FusionRun()
            run.managedAccountsById.set('src-a::native-1', account)

            acc.addManagedAccountLayer(run)

            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.missingAccountIds).toContain('src-a::native-1')
            expect(run.managedAccountsById.size).toBe(0)
        })

        it('sets orphan status when identity-origin account loses all managed accounts and identity is out of scope', () => {
            const identity: IdentityDocument = { id: 'id-1', name: 'test-identity', attributes: {} } as any
            const acc = FusionAccount.fromIdentity(identity)
            acc.setOriginIdentityInScope(false)

            const run = new FusionRun()
            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.isOrphan()).toBe(true)
            expect(acc.statuses).toContain('orphan')
        })
    })

    describe('pruneDeletedManagedAccounts', () => {
        it('removes account references that no longer exist in the inventory', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['src-a::old-1'],
                    'missing-accounts': ['src-a::old-2'],
                },
            } as unknown as Account)

            // Ensure previousAccountIds is hydrated from persisted accounts
            expect((acc as any).previousAccountIds).toContain('src-a::old-1')

            const run = new FusionRun()
            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.accountIds).not.toContain('src-a::old-1')
            expect(acc.missingAccountIds).not.toContain('src-a::old-2')
            expect(acc.history.some((h) => h.includes('Removed managed account missing reference'))).toBe(true)
        })

        it('clears needsRefresh when a managed-origin account becomes orphan after pruning', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-2',
                id: 'isc-2',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['src-a::gone'],
                },
            } as unknown as Account)

            const run = new FusionRun()
            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.isOrphan()).toBe(true)
            expect(acc.needsRefresh).toBe(false)
        })
    })

    describe('attribute-bag setters', () => {
        it('addAccountId adds to correlated set and sync reflects it', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addAccountId('src-a::native-1')
            acc.syncCollectionAttributesToBag()
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.attributes.accounts).toContain('src-a::native-1')
        })

        it('addMissingAccountId adds to missing set and sync reflects it', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addMissingAccountId('src-a::missing-1')
            acc.syncCollectionAttributesToBag()
            expect(acc.missingAccountIds).toContain('src-a::missing-1')
            expect(acc.attributes['missing-accounts']).toContain('src-a::missing-1')
        })

        it('setCorrelatedAccount moves an id from missing to correlated', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.addMissingAccountId('src-a::native-1')
            acc.setCorrelatedAccount('src-a::native-1')
            acc.syncCollectionAttributesToBag()
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.missingAccountIds).not.toContain('src-a::native-1')
            expect(acc.attributes.accounts).toContain('src-a::native-1')
        })
    })

    describe('FusionAccount state encapsulation', () => {
        it('collections sub-object reflects account mutations', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)

            acc.addAccountId('src-a::native-1')
            expect(acc.collections.accountIds.has('src-a::native-1')).toBe(true)
            expect(acc.accountIds).toContain('src-a::native-1')

            acc.addStatus('test-status')
            expect(acc.collections.statusesSet.has('test-status')).toBe(true)
            expect(acc.statuses).toContain('test-status')

            acc.setCorrelatedAccount('src-a::native-1')
            expect(acc.collections.accountIds.has('src-a::native-1')).toBe(true)
            expect(acc.collections.missingAccountIds.has('src-a::native-1')).toBe(false)
        })
    })

    describe('identityAlias accessor', () => {
        it('returns identityInfo.displayName when set', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1', name: 'login', attributes: { displayName: 'Display Name' } } as any)
            expect(acc.identityAlias).toBe('Display Name')
        })

        it('returns undefined when identityInfo is not set', () => {
            const acc = FusionAccount.fromFusionDecision({
                account: { id: 'src-a::native-1', sourceId: 'src-a', nativeIdentity: 'native-1', sourceName: 'Source A' },
                newIdentity: true,
                submitter: { name: 'test' },
            } as any)
            expect(acc.identityAlias).toBeUndefined()
        })
    })
})
