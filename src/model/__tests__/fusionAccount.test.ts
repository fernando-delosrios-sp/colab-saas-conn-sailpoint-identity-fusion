import { FusionAccount } from '../fusionAccount'
import { FusionConfig, SourceType } from '../config'
import { Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionDecision } from '../form'
import { FusionAccountKind } from '../fusionAccountTypes'

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
            expect(acc.sourceName).toBe('Identities')
            expect(acc.statuses).toContain('baseline')
            expect(acc.fromIdentity).toBe(true)
        })

        it('fromManagedAccount initializes correctly', () => {
            const account: Account = { id: 'isc-acc-1', sourceId: 'src-a', nativeIdentity: 'nat-1', sourceName: 'Source A', attributes: {} } as any
            const acc = FusionAccount.fromManagedAccount(account)
            expect(acc.type).toBe(FusionAccountKind.Managed)
            expect(acc.sourceName).toBe('Source A')
            expect(acc.statuses).toContain('uncorrelated')
            expect(acc.needsReset).toBe(true)
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
            expect(acc.nativeIdentity).toBe('src-a::native-1')
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
            const accountsById = new Map<string, Account>([
                ['src-a::native-1', { id: 'isc-acc-1', sourceId: 'src-a', nativeIdentity: 'native-1', sourceName: 'Source A', attributes: {} } as any]
            ])
            const accountsByIdentityId = new Map([['id-1', new Set(['src-a::native-1'])]])
            
            acc.addManagedAccountLayer(accountsById, accountsByIdentityId)
            expect(acc.accountIds).toContain('src-a::native-1')
            expect(accountsById.size).toBe(0)
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
            acc.addStatus('baseline')
            acc.syncCollectionAttributesToBag()
            
            const iscAccount = acc.toISCAccount()
            iscAccount.nativeIdentity = 'id-1'
            iscAccount.id = 'isc-1'
            
            const restored = FusionAccount.fromFusionAccount(iscAccount)
            expect(restored.statuses).toContain('baseline')
            expect(restored.nativeIdentity).toBe('id-1')
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
})
