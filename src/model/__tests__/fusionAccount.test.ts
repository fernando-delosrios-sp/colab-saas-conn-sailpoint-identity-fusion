import { FusionAccount, IDENTITIES_SOURCE_NAME } from '../fusionAccount'
import { resolveFusionAccountNameOrDisplayName } from '../fusionAccountUtils'
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
        resetAccounts: false,
        resetForms: false,
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
            expect(acc.statuses).toContain('new')
            expect(acc.fromIdentity).toBe(true)
            expect(acc.managedKey).toBe(`${IDENTITIES_SOURCE_NAME}::id-1`)
        })

        it('fromManagedAccount initializes correctly', () => {
            const account: Account = { id: 'isc-acc-1', sourceId: 'src-a', nativeIdentity: 'nat-1', sourceName: 'Source A', attributes: {} } as any
            const acc = FusionAccount.fromManagedAccount(account)
            expect(acc.type).toBe(FusionAccountKind.Managed)
            expect(acc.sourceName).toBe('Source A')
            expect(acc.statuses).toContain('uncorrelated')
            expect(acc.statuses).toContain('new')
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
            expect(acc.statuses).toContain('new')
        })

        it('fromFusionAccount removes persisted new status', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                sourceName: 'Identity Fusion NG',
                attributes: { statuses: ['new', 'uncorrelated'] },
            } as Account)

            expect(acc.statuses).not.toContain('new')
            expect(acc.statuses).toContain('uncorrelated')
        })

        it('fromFusionAccount does not add new when it was not persisted', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-2',
                sourceName: 'Identity Fusion NG',
                attributes: { statuses: ['uncorrelated'] },
            } as Account)

            expect(acc.statuses).not.toContain('new')
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
            expect(acc.sources).toContain('Source A')
            expect(acc.attributeBag.sources.get('Source A')).toHaveLength(1)
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
            acc.layers.addFusionDecisionLayer(decision)
            expect(acc.statuses).toContain('manual')
        })
    })

    describe('3. Status state machine', () => {
        it('addStatus, removeStatus, hasStatus, statuses', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.statuses.add('testStatus')
            expect(acc.collections.statuses.has('testStatus')).toBe(true)
            expect(acc.statuses).toContain('testStatus')
            acc.collections.statuses.remove('testStatus')
            expect(acc.collections.statuses.has('testStatus')).toBe(false)
        })
    })

    describe('4. Action state machine', () => {
        it('addAction, removeAction, actions, setSourceReviewer, removeSourceReviewer, listReviewerSources', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.actions.add('testAction')
            expect(acc.actions).toContain('testAction')
            acc.collections.actions.remove('testAction')
            
            acc.collections.actions.setSourceReviewer('src-a')
            expect(acc.actions).toContain('reviewer:src-a')
            expect(acc.collections.statuses.has('reviewer')).toBe(true)
            expect(acc.collections.actions.listReviewerSources()).toEqual(['src-a'])
            
            acc.collections.actions.removeSourceReviewer('src-a')
            expect(acc.actions).not.toContain('reviewer:src-a')
            expect(acc.collections.statuses.has('reviewer')).toBe(false)
        })
    })

    describe('5. Review tracking', () => {
        it('manages reviews correctly', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.reviews.add('url1')
            expect(acc.reviews).toContain('url1')
            acc.collections.reviews.remove('url1')
            
            acc.collections.reviews.addFusionReview('url2')
            expect(acc.reviews).toContain('url2')
            expect(acc.collections.statuses.has('activeReviews')).toBe(true)
            
            acc.collections.reviews.removeFusionReview('url2')
            expect(acc.collections.statuses.has('activeReviews')).toBe(false)
            
            acc.collections.reviews.addFusionReview('url3')
            acc.collections.reviews.clearFusionReviews()
            expect(acc.reviews.length).toBe(0)
            
            acc.collections.reviews.addPendingUrl('url4')
            acc.correlation.resolvePendingReviewUrls()
            expect(acc.reviews).toContain('url4')
        })
    })

    describe('6. Account ID management', () => {
        it('adds and removes account ids', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.accounts.add('acc-1')
            expect(acc.accountIds).toContain('acc-1')
            acc.collections.accounts.remove('acc-1')
            
            acc.collections.accounts.addMissing('missing-1')
            expect(acc.missingAccountIds).toContain('missing-1')
            acc.collections.accounts.removeMissing('missing-1')
        })
    })

    describe('7. Correlation promises', () => {
        it('handles correlation promises', async () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.accounts.addMissing('acc-1')
            acc.correlation.markCorrelated('acc-1', Promise.resolve('ok'))
            expect(acc.accountIds).toContain('acc-1')
            expect(acc.missingAccountIds).not.toContain('acc-1')
            
            await acc.correlation.resolvePendingOperations()
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
            acc.collections.statuses.add('status1')
            acc.collections.actions.add('action1')
            acc.syncCollectionAttributesToBag()
            expect(acc.attributes.statuses).toContain('status1')
            expect(acc.attributes.actions).toContain('action1')
        })

        it('syncCollectionAttributesToBag writes only the current attribute bag', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.attributes.statuses = ['stale-on-current']
            acc.attributes.actions = ['stale-action']
            ;(acc as any).attributeBagValue.previous = {
                statuses: ['previous-only-status'],
                actions: ['previous-only-action'],
            }

            acc.collections.statuses.add('live-status')
            acc.collections.actions.add('live-action')
            acc.syncCollectionAttributesToBag()

            expect(acc.attributes.statuses).toContain('live-status')
            expect(acc.attributes.actions).toContain('live-action')
            expect(acc.attributes.statuses).not.toContain('previous-only-status')
            expect((acc as any).attributeBagValue.previous.statuses).toEqual(['previous-only-status'])
            expect((acc as any).attributeBagValue.previous.actions).toEqual(['previous-only-action'])
        })
    })

    describe('collaborator presence', () => {
        it('exposes readonly collections, correlation, and layers on a new FusionAccount', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            expect(acc.collections).toBeDefined()
            expect(acc.correlation).toBeDefined()
            expect(acc.layers).toBeDefined()
            expect(typeof acc.collections.statuses.add).toBe('function')
            expect(typeof acc.correlation.markCorrelated).toBe('function')
            expect(typeof acc.layers.addFusionMatch).toBe('function')
        })
    })

    describe('10. toISCAccount serialization', () => {
        it('round trips toISCAccount and fromFusionAccount', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1', attributes: { email: 'a@b.com' } } as any)
            acc.setKey({ simple: { id: 'id-1' } })
            acc.collections.statuses.add(StatusEntitlement.Baseline)
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
            acc.collections.statuses.add(StatusEntitlement.Baseline)
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
            // identityInfoValue is created from the persisted attribute (not from the SDK Account)
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

        it('setIdentityIdAttribute trims and stores the id on identityInfoValue', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.setIdentityIdAttribute('  identity-42  ')
            expect(acc.identityIdAttribute).toBe('identity-42')
            expect((acc as any).identityInfoValue?.id).toBe('identity-42')
            // Empty values are stored as empty string; hasValue returns false
            acc.setIdentityIdAttribute('')
            expect(acc.identityIdAttribute).toBe('')
            expect((acc as any).identityInfoValue?.id).toBe('')
        })

        it('preserves name/displayName when setIdentityIdAttribute updates an existing identityInfoValue', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1', name: 'Jane Doe' } as any)
            expect((acc as any).identityInfoValue?.name).toBeTruthy()
            acc.setIdentityIdAttribute('identity-99')
            expect(acc.identityId).toBe('identity-99')
            expect((acc as any).identityInfoValue?.name).toBeTruthy()
        })
    })

    describe('11. History', () => {
        it('imports and caps history', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            const hist = Array.from({ length: 60 }, (_, i) => `[Date] message ${i}`)
            acc.collections.historyOps.importFromArray(hist)
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
            acc.layers.addFusionMatch({ fusionIdentity: {} as any, score: 100 } as any)
            expect(acc.isMatch).toBe(true)
            expect(acc.fusionMatches.length).toBe(1)
            
            acc.layers.clearFusionIdentityReferences()
            expect((acc.fusionMatches[0] as any).fusionIdentity).toBeUndefined()
        })
    })

    describe('13. buildIdentityInfo', () => {
        it('builds identity info', () => {
            const info = FusionAccount.buildIdentityInfo({ id: 'id-1', name: 'Name', displayName: 'Display Name' } as any)
            expect(info).toEqual({ id: 'id-1', name: 'Name', displayName: 'Display Name' })
        })
    })

    describe('13b. resolveFusionAccountNameOrDisplayName', () => {
        it('prefers name over displayName', () => {
            expect(resolveFusionAccountNameOrDisplayName({ name: 'Name', displayName: 'Display' }, 'fallback')).toBe(
                'Name'
            )
        })

        it('falls back to displayName then explicit fallback', () => {
            expect(resolveFusionAccountNameOrDisplayName({ displayName: 'Display' }, 'fallback')).toBe('Display')
            expect(resolveFusionAccountNameOrDisplayName({}, 'fallback')).toBe('fallback')
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
            expect(acc.originAccountId).toBe('src-a::native-1')
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
            expect(acc.previousAccountIdsSet.has('src-a::correlated-1')).toBe(true)
            expect(acc.previousAccountIdsSet.has('src-b::correlated-2')).toBe(true)
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
            expect(acc.sources).toContain('Source A')
            expect(acc.attributeBag.sources.get('Source A')).toHaveLength(1)
            expect(run.managedAccountsById.size).toBe(0)
            expect(run.managedAccountsByIdentityId.has('id-1')).toBe(false)
        })

        it('blends identity.accounts links in work queue when not indexed by identityId', () => {
            const WORKDAY_SOURCE_ID = '355fb49e084e4f35adb755410affe0c8'
            const managedKey = `${WORKDAY_SOURCE_ID}::126791`

            const identity: IdentityDocument = {
                id: 'id-1',
                name: 'test-identity',
                attributes: {},
                accounts: [
                    {
                        source: { name: 'Source A', id: 'src-a' },
                        nativeIdentity: 'native-1',
                    } as any,
                ],
            } as any
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Fusion Row',
                sourceName: 'Identity Fusion NG',
                identityId: 'id-1',
                attributes: { accounts: [managedKey] },
            } as unknown as Account)

            acc.addIdentityLayer(identity)

            const account: Account = {
                id: 'isc-acc-1',
                sourceId: 'src-a',
                nativeIdentity: 'native-1',
                sourceName: 'Source A',
                attributes: { POSITION: 'Engineer' },
            } as any
            const run = new FusionRun()
            run.managedAccountsById.set('src-a::native-1', account)

            acc.addManagedAccountLayer(run)

            const snapshots = acc.attributeBag.sources.get('Source A')
            expect(snapshots).toHaveLength(1)
            expect(snapshots![0].POSITION).toBe('Engineer')
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.missingAccountIds).not.toContain('src-a::native-1')
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

            expect(acc.collections.statuses.isOrphan()).toBe(true)
            expect(acc.statuses).toContain('orphan')
        })

        it('does not mark identity-origin account orphan when origin identity is in scope and there are no managed accounts', () => {
            const identity: IdentityDocument = { id: 'id-1', name: 'test-identity', attributes: {} } as any
            const acc = FusionAccount.fromIdentity(identity)
            acc.setOriginIdentityInScope(true)

            const run = new FusionRun()
            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.collections.statuses.isOrphan()).toBe(false)
            expect(acc.statuses).not.toContain('orphan')
        })

        it('does not mark identity-origin account orphan when scope has not been evaluated yet', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                identityId: 'id-1',
                attributes: {
                    originSource: IDENTITIES_SOURCE_NAME,
                    originAccount: 'id-1',
                    accounts: [],
                    statuses: ['baseline'],
                },
            } as unknown as Account)

            const run = new FusionRun()
            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.collections.statuses.isOrphan()).toBe(false)
        })

        it('clears stale orphan status when identity-origin account is in scope with no managed accounts', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                identityId: 'id-1',
                attributes: {
                    originSource: IDENTITIES_SOURCE_NAME,
                    originAccount: 'id-1',
                    accounts: [],
                    statuses: ['baseline', 'orphan'],
                },
            } as unknown as Account)
            acc.setOriginIdentityInScope(true)

            const run = new FusionRun()
            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.collections.statuses.isOrphan()).toBe(false)
            expect(acc.statuses).not.toContain('orphan')
        })

        it('treats baseline-only persisted rows as identity-origin for orphan detection', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                identityId: 'id-1',
                attributes: {
                    originAccount: 'id-1',
                    accounts: [],
                    statuses: ['baseline'],
                },
            } as unknown as Account)

            expect(acc.fromIdentity).toBe(true)
            acc.setOriginIdentityInScope(true)

            const run = new FusionRun()
            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.collections.statuses.isOrphan()).toBe(false)
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
            expect(acc.previousAccountIdsSet.has('src-a::old-1')).toBe(true)

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

            expect(acc.collections.statuses.isOrphan()).toBe(true)
            expect(acc.needsRefresh).toBe(false)
        })
    })

    describe('managed-account modified vs fusion modified', () => {
        const fusionModified = '2024-06-01T12:00:00.000Z'

        const persistedFusionWithQueuedManaged = (options: {
            fusionModified?: string
            managedModified: string
        }) => {
            const fusionAccountPayload: Record<string, unknown> = {
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['src-a::keep-1'],
                },
            }
            if (options.fusionModified !== undefined) {
                fusionAccountPayload.modified = options.fusionModified
            }
            const acc = FusionAccount.fromFusionAccount(fusionAccountPayload as unknown as Account)
            const run = new FusionRun()
            run.managedAccountsById.set('src-a::keep-1', {
                id: 'isc-keep-1',
                sourceId: 'src-a',
                nativeIdentity: 'keep-1',
                sourceName: 'Source A',
                modified: options.managedModified,
                attributes: {},
            } as any)
            acc.addManagedAccountLayer(run)
            return { acc, run }
        }

        it('previously correlated stale managed account does not force refresh', () => {
            const { acc, run } = persistedFusionWithQueuedManaged({
                fusionModified,
                managedModified: '2024-01-01T00:00:00.000Z',
            })

            expect(acc.needsRefresh).toBe(false)
            expect(acc.accountIds).toContain('src-a::keep-1')
            expect(run.managedAccountsById.has('src-a::keep-1')).toBe(false)
        })

        it('managed account newer than fusion modified beyond the threshold forces refresh', () => {
            const { acc } = persistedFusionWithQueuedManaged({
                fusionModified,
                managedModified: '2024-06-01T14:00:00.000Z',
            })

            expect(acc.needsRefresh).toBe(true)
        })

        it('managed account newer than fusion modified within the threshold does not force refresh', () => {
            const { acc } = persistedFusionWithQueuedManaged({
                fusionModified,
                managedModified: '2024-06-01T12:30:00.000Z',
            })

            expect(acc.needsRefresh).toBe(false)
        })

        it('new blend still forces refresh', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            const run = new FusionRun()
            run.managedAccountsById.set('src-a::native-1', {
                id: 'isc-acc-1',
                sourceId: 'src-a',
                nativeIdentity: 'native-1',
                sourceName: 'Source A',
                modified: '2020-01-01T00:00:00.000Z',
                attributes: {},
            } as any)
            run.managedAccountsByIdentityId.set('id-1', new Set(['src-a::native-1']))

            acc.addManagedAccountLayer(run)

            expect(acc.needsRefresh).toBe(true)
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(run.managedAccountsById.size).toBe(0)
        })

        it('missing fusion modified does not use epoch as the refresh reference', () => {
            const { acc, run } = persistedFusionWithQueuedManaged({
                managedModified: '2024-06-01T14:00:00.000Z',
            })

            expect(acc.needsRefresh).toBe(false)
            expect(acc.accountIds).toContain('src-a::keep-1')
            expect(run.managedAccountsById.has('src-a::keep-1')).toBe(false)
        })
    })

    describe('claim-only vs source snapshot materialization', () => {
        const fusionModified = '2024-06-01T12:00:00.000Z'
        const distinctAttributeName = 'employeeNumber'
        const distinctAttributeValue = 'EMP-CLAIM-ONLY-999'

        const queueManaged = (
            sourceId: string,
            nativeIdentity: string,
            extras: Record<string, unknown> = {}
        ): Account =>
            ({
                id: `isc-${sourceId}-${nativeIdentity}`,
                sourceId,
                nativeIdentity,
                sourceName: sourceId === 'src-a' ? 'Source A' : 'Source B',
                attributes: { [distinctAttributeName]: distinctAttributeValue, ...((extras.attributes as object) ?? {}) },
                ...Object.fromEntries(Object.entries(extras).filter(([key]) => key !== 'attributes')),
            }) as Account

        const persistedFusion = (accountKeys: string[], extras: Record<string, unknown> = {}) =>
            FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-claim-only',
                id: 'isc-claim-only',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                modified: fusionModified,
                attributes: {
                    accounts: accountKeys,
                    givenName: 'Already',
                    ...((extras.attributes as object) ?? {}),
                },
                ...Object.fromEntries(Object.entries(extras).filter(([key]) => key !== 'attributes')),
            } as unknown as Account)

        const sourceHasDistinctSnapshot = (acc: FusionAccount, sourceName: string): boolean => {
            const snapshots = acc.attributeBag.sources.get(sourceName) ?? []
            return snapshots.some((snapshot) => snapshot[distinctAttributeName] === distinctAttributeValue)
        }

        it('stale previously correlated accounts are claim-only', () => {
            const acc = persistedFusion(['src-a::keep-1'])
            expect(acc.previousAccountIdsSet.has('src-a::keep-1')).toBe(true)
            expect(acc.attributeBag.current[distinctAttributeName]).toBeUndefined()

            const run = new FusionRun()
            run.setManagedAccount(
                'src-a::keep-1',
                queueManaged('src-a', 'keep-1', { modified: '2024-01-01T00:00:00.000Z' })
            )

            acc.addManagedAccountLayer(run)

            expect(acc.needsRefresh).toBe(false)
            expect(run.managedAccountsById.has('src-a::keep-1')).toBe(false)
            expect(sourceHasDistinctSnapshot(acc, 'Source A')).toBe(false)
        })

        it('new blend materializes snapshots for the row', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-new-blend' } as any)
            const run = new FusionRun()
            run.setManagedAccount(
                'src-a::native-1',
                queueManaged('src-a', 'native-1', { modified: '2020-01-01T00:00:00.000Z' })
            )
            run.managedAccountsByIdentityId.set('id-new-blend', new Set(['src-a::native-1']))

            acc.addManagedAccountLayer(run)

            expect(acc.needsRefresh).toBe(true)
            expect(sourceHasDistinctSnapshot(acc, 'Source A')).toBe(true)
            expect(run.managedAccountsById.has('src-a::native-1')).toBe(false)
        })

        it('over-threshold modified materializes all live linked accounts on the row', () => {
            const acc = persistedFusion(['src-a::keep-1', 'src-b::keep-2'])
            const run = new FusionRun()
            run.setManagedAccount(
                'src-a::keep-1',
                queueManaged('src-a', 'keep-1', {
                    modified: '2024-06-01T14:00:00.000Z',
                    attributes: { [distinctAttributeName]: distinctAttributeValue, sibling: 'a' },
                })
            )
            run.setManagedAccount(
                'src-b::keep-2',
                queueManaged('src-b', 'keep-2', {
                    modified: '2024-01-01T00:00:00.000Z',
                    attributes: { [distinctAttributeName]: distinctAttributeValue, sibling: 'b' },
                })
            )

            acc.addManagedAccountLayer(run)

            expect(acc.needsRefresh).toBe(true)
            expect(sourceHasDistinctSnapshot(acc, 'Source A')).toBe(true)
            expect(sourceHasDistinctSnapshot(acc, 'Source B')).toBe(true)
        })

        it('prune-deleted requires materializing remaining live accounts', () => {
            const acc = persistedFusion(['src-a::keep-1'], {
                attributes: {
                    accounts: ['src-a::keep-1'],
                    'missing-accounts': ['src-a::gone-1'],
                    givenName: 'Already',
                },
            })
            const run = new FusionRun()
            run.setManagedAccount(
                'src-a::keep-1',
                queueManaged('src-a', 'keep-1', { modified: '2024-01-01T00:00:00.000Z' })
            )

            acc.addManagedAccountLayer(run, { pruneDeleted: true })

            expect(acc.needsRefresh).toBe(true)
            expect(acc.accountIds).not.toContain('src-a::gone-1')
            expect(sourceHasDistinctSnapshot(acc, 'Source A')).toBe(true)
            expect(run.managedAccountsById.has('src-a::keep-1')).toBe(false)
        })

        it('force attribute refresh materializes before Map', () => {
            const acc = persistedFusion(['src-a::keep-1'])
            const run = new FusionRun()
            run.setManagedAccount(
                'src-a::keep-1',
                queueManaged('src-a', 'keep-1', { modified: '2024-01-01T00:00:00.000Z' })
            )

            acc.addManagedAccountLayer(run, { forceAttributeRefresh: true })

            expect(sourceHasDistinctSnapshot(acc, 'Source A')).toBe(true)
            expect(run.managedAccountsById.has('src-a::keep-1')).toBe(false)
        })

        it('eligible Always recalculate materializes when timestamps are stale', () => {
            const acc = persistedFusion(['src-a::keep-1'])
            const run = new FusionRun()
            run.setManagedAccount(
                'src-a::keep-1',
                queueManaged('src-a', 'keep-1', { modified: '2024-01-01T00:00:00.000Z' })
            )

            acc.addManagedAccountLayer(run, { hasEligibleAlwaysRecalculate: true })

            expect(sourceHasDistinctSnapshot(acc, 'Source A')).toBe(true)
            expect(run.managedAccountsById.has('src-a::keep-1')).toBe(false)
        })
    })

    describe('attribute-bag setters', () => {
        it('addAccountId adds to correlated set and sync reflects it', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.accounts.add('src-a::native-1')
            acc.syncCollectionAttributesToBag()
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.attributes.accounts).toContain('src-a::native-1')
        })

        it('addMissingAccountId adds to missing set and sync reflects it', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.accounts.addMissing('src-a::missing-1')
            acc.syncCollectionAttributesToBag()
            expect(acc.missingAccountIds).toContain('src-a::missing-1')
            expect(acc.attributes['missing-accounts']).toContain('src-a::missing-1')
        })

        it('setCorrelatedAccount moves an id from missing to correlated', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
            acc.collections.accounts.addMissing('src-a::native-1')
            acc.correlation.markCorrelated('src-a::native-1')
            acc.syncCollectionAttributesToBag()
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(acc.missingAccountIds).not.toContain('src-a::native-1')
            expect(acc.attributes.accounts).toContain('src-a::native-1')
        })
    })

    describe('FusionAccount state encapsulation', () => {
        it('collections sub-object reflects account mutations', () => {
            const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)

            acc.collections.accounts.add('src-a::native-1')
            expect(acc.collections.accountIds.has('src-a::native-1')).toBe(true)
            expect(acc.accountIds).toContain('src-a::native-1')

            acc.collections.statuses.add('test-status')
            expect(acc.collections.statusesSet.has('test-status')).toBe(true)
            expect(acc.statuses).toContain('test-status')

            acc.correlation.markCorrelated('src-a::native-1')
            expect(acc.collections.accountIds.has('src-a::native-1')).toBe(true)
            expect(acc.collections.missingAccountIds.has('src-a::native-1')).toBe(false)
        })
    })

    describe('17. Composite-only account reference loading', () => {
        it('drops non-composite accounts values during fromFusionAccount', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    accounts: ['legacy-uuid-only', 'src-a::user-1'],
                },
            } as unknown as Account)
            expect(acc.previousAccountIdsSet.has('src-a::user-1')).toBe(true)
            expect(acc.previousAccountIdsSet.has('legacy-uuid-only')).toBe(false)
        })

        it('drops non-composite missing-accounts values during fromFusionAccount', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Account',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    'missing-accounts': ['legacy-uuid-only', 'src-a::missing-1'],
                },
            } as unknown as Account)
            expect(acc.missingAccountIds).toContain('src-a::missing-1')
            expect(acc.missingAccountIds).not.toContain('legacy-uuid-only')
        })

        it('retains identity ID originAccount for Identities origin', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    originSource: IDENTITIES_SOURCE_NAME,
                    originAccount: 'identity-uuid-123',
                },
            } as unknown as Account)
            expect(acc.originAccountId).toBe('identity-uuid-123')
        })

        it('retains originAccount from baseline-only persisted rows without originSource', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-1',
                id: 'isc-1',
                name: 'Persisted Identity',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    originAccount: 'identity-baseline-only',
                    statuses: ['baseline'],
                },
            } as unknown as Account)
            expect(acc.fromIdentity).toBe(true)
            expect(acc.originAccountId).toBe('identity-baseline-only')
        })

        it('rejects raw originAccount for managed-source origin', () => {
            const acc = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-2',
                id: 'isc-2',
                name: 'Persisted Managed',
                sourceName: 'Identity Fusion NG',
                attributes: {
                    originSource: 'Workday',
                    originAccount: 'legacy-uuid-only',
                },
            } as unknown as Account)
            expect(acc.originAccountId).toBeUndefined()
        })
    })

    describe('identityAlias accessor', () => {
        it('returns identityInfo.name (login) when set', () => {
            const acc = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'login',
                displayName: 'Display Name',
                attributes: { displayName: 'Attr Display Name' },
            } as any)
            expect(acc.identityAlias).toBe('login')
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

    describe('identityDisplayName accessor', () => {
        it('prefers attributes.displayName over top-level displayName and name', () => {
            const acc = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'login',
                displayName: 'Top Display Name',
                attributes: { displayName: 'Attr Display Name' },
            } as any)
            expect(acc.identityDisplayName).toBe('Attr Display Name')
        })

        it('falls back to top-level displayName then name', () => {
            const acc = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'login',
                displayName: 'Top Display Name',
                attributes: {},
            } as any)
            expect(acc.identityDisplayName).toBe('Top Display Name')

            const nameOnly = FusionAccount.fromIdentity({
                id: 'id-2',
                name: 'login-only',
                attributes: {},
            } as any)
            expect(nameOnly.identityDisplayName).toBe('login-only')
        })
    })
})
