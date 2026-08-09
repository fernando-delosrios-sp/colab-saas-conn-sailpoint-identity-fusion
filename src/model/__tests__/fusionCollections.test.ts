import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { FusionCollections } from '../fusionCollections'

describe('FusionCollections', () => {
    let collections: FusionCollections

    beforeAll(() => {
        collections = new FusionCollections(50)
    })

    describe('accounts', () => {
        it('adds and removes correlated account IDs', () => {
            collections.accounts.add('src-a::native-1')
            expect(collections.accountIds.has('src-a::native-1')).toBe(true)

            collections.accounts.remove('src-a::native-1')
            expect(collections.accountIds.has('src-a::native-1')).toBe(false)
        })

        it('adds and removes missing account IDs', () => {
            collections.accounts.addMissing('src-b::missing-1')
            expect(collections.missingAccountIds.has('src-b::missing-1')).toBe(true)

            collections.accounts.removeMissing('src-b::missing-1')
            expect(collections.missingAccountIds.has('src-b::missing-1')).toBe(false)
        })

        it('getMissingForSource filters by source name', () => {
            collections.setManagedAccountInfo('src-a::native-1', {
                source: { name: 'Source A' },
                schema: { id: 'native-1' },
            })
            collections.setManagedAccountInfo('src-a::native-2', {
                source: { name: 'Source A' },
                schema: { id: 'native-2' },
            })
            collections.setManagedAccountInfo('src-b::native-1', {
                source: { name: 'Source B' },
                schema: { id: 'native-1' },
            })

            collections.accounts.addMissing('src-a::native-1')
            collections.accounts.addMissing('src-a::native-2')
            collections.accounts.addMissing('src-b::native-1')

            const result = collections.accounts.getMissingForSource('Source A')
            expect(result).toContain('src-a::native-1')
            expect(result).toContain('src-a::native-2')
            expect(result).not.toContain('src-b::native-1')
        })
    })

    describe('hydratePersisted', () => {
        let hydrateTarget: FusionCollections

        beforeEach(() => {
            hydrateTarget = new FusionCollections(50)
        })

        it('restores statuses, actions, reviews, sources, and account sets from iterables', () => {
            hydrateTarget.hydratePersisted({
                sources: ['Identities', 'Source A'],
                statuses: ['baseline', 'uncorrelated'],
                actions: ['correlated'],
                reviews: ['https://review/1'],
                accountIds: ['src-a::acc-1'],
                missingAccountIds: ['src-a::missing-1'],
                previousAccountIds: ['src-a::prev-1'],
                clearMissingBeforeAdd: true,
                clearReviewsBeforeAdd: true,
            })

            expect(hydrateTarget.sourcesSet.has('Identities')).toBe(true)
            expect(hydrateTarget.sourcesSet.has('Source A')).toBe(true)
            expect(hydrateTarget.statusesSet.has('baseline')).toBe(true)
            expect(hydrateTarget.statusesSet.has('uncorrelated')).toBe(true)
            expect(hydrateTarget.actionsSet.has('correlated')).toBe(true)
            expect(hydrateTarget.reviewsSet.has('https://review/1')).toBe(true)
            expect(hydrateTarget.accountIds.has('src-a::acc-1')).toBe(true)
            expect(hydrateTarget.missingAccountIds.has('src-a::missing-1')).toBe(true)
            expect(hydrateTarget.previousAccountIds.has('src-a::prev-1')).toBe(true)
        })

        it('clears missing and reviews before add when requested', () => {
            hydrateTarget.accounts.addMissing('stale-missing')
            hydrateTarget.reviews.add('https://stale/review')

            hydrateTarget.hydratePersisted({
                missingAccountIds: ['src-a::fresh-missing'],
                reviews: ['https://fresh/review'],
                clearMissingBeforeAdd: true,
                clearReviewsBeforeAdd: true,
            })

            expect(hydrateTarget.missingAccountIds.has('stale-missing')).toBe(false)
            expect(hydrateTarget.missingAccountIds.has('src-a::fresh-missing')).toBe(true)
            expect(hydrateTarget.reviewsSet.has('https://stale/review')).toBe(false)
            expect(hydrateTarget.reviewsSet.has('https://fresh/review')).toBe(true)
        })

        it('replace helpers and managed-account info APIs seed without _internal_ accessors', () => {
            hydrateTarget.accounts.add('old-account')
            hydrateTarget.accounts.addMissing('old-missing')

            hydrateTarget.replaceAccountIds(['src-a::new-1', 'src-a::new-2'])
            hydrateTarget.replaceMissingAccountIds(['src-a::missing-new'])
            hydrateTarget.setPreviousAccountIds(['src-a::prev-new'])
            hydrateTarget.setManagedAccountInfo('src-a::new-1', {
                source: { name: 'Source A' },
                schema: { id: 'new-1' },
            })

            expect([...hydrateTarget.accountIds].sort()).toEqual(['src-a::new-1', 'src-a::new-2'])
            expect([...hydrateTarget.missingAccountIds]).toEqual(['src-a::missing-new'])
            expect([...hydrateTarget.previousAccountIds]).toEqual(['src-a::prev-new'])
            expect(hydrateTarget.managedAccountInfo.get('src-a::new-1')?.source.name).toBe('Source A')

            hydrateTarget.deleteManagedAccountInfo('src-a::new-1')
            expect(hydrateTarget.managedAccountInfo.has('src-a::new-1')).toBe(false)

            expect(hydrateTarget.hasAction('correlated')).toBe(false)
            hydrateTarget.actions.add('correlated')
            expect(hydrateTarget.hasAction('correlated')).toBe(true)
            hydrateTarget.removeActionSilent('correlated')
            expect(hydrateTarget.hasAction('correlated')).toBe(false)
        })
    })

    describe('statuses', () => {
        it('adds, removes, and checks statuses', () => {
            collections.statuses.add('test-status')
            expect(collections.statusesSet.has('test-status')).toBe(true)
            expect(collections.statuses.has('test-status')).toBe(true)

            collections.statuses.remove('test-status')
            expect(collections.statusesSet.has('test-status')).toBe(false)
            expect(collections.statuses.has('test-status')).toBe(false)
        })

        it('sets nonMatched status', () => {
            collections.statuses.setNonMatched('Test User', 'Source A')
            expect(collections.statusesSet.has('nonMatched')).toBe(true)
        })
    })

    describe('actions', () => {
        it('adds and removes actions', () => {
            collections.actions.add('correlated')
            expect(collections.actionsSet.has('correlated')).toBe(true)

            collections.actions.remove('correlated')
            expect(collections.actionsSet.has('correlated')).toBe(false)
        })

        it('sets and removes source reviewer', () => {
            collections.actions.setSourceReviewer('src-1')
            expect(collections.actionsSet.has('reviewer:src-1')).toBe(true)
            expect(collections.statusesSet.has('reviewer')).toBe(true)

            collections.actions.removeSourceReviewer('src-1')
            expect(collections.actionsSet.has('reviewer:src-1')).toBe(false)
        })

        it('lists reviewer sources', () => {
            collections.actions.setSourceReviewer('src-1')
            collections.actions.setSourceReviewer('src-2')

            const sources = collections.actions.listReviewerSources()
            expect(sources).toContain('src-1')
            expect(sources).toContain('src-2')
        })
    })

    describe('reviews', () => {
        it('adds and removes reviews', () => {
            collections.reviews.add('https://review/1')
            expect(collections.reviewsSet.has('https://review/1')).toBe(true)

            collections.reviews.remove('https://review/1')
            expect(collections.reviewsSet.has('https://review/1')).toBe(false)
        })

        it('adds and removes fusion reviews with status management', () => {
            collections.reviews.addFusionReview('https://fusion/1')
            expect(collections.reviewsSet.has('https://fusion/1')).toBe(true)
            expect(collections.statusesSet.has('activeReviews')).toBe(true)

            collections.reviews.removeFusionReview('https://fusion/1')
            expect(collections.reviewsSet.has('https://fusion/1')).toBe(false)
            expect(collections.statusesSet.has('activeReviews')).toBe(false)
        })

        it('clears all fusion reviews', () => {
            collections.reviews.addFusionReview('https://fusion/1')
            collections.reviews.addFusionReview('https://fusion/2')
            collections.reviews.clearFusionReviews()
            expect(collections.reviewsSet.size).toBe(0)
            expect(collections.statusesSet.has('activeReviews')).toBe(false)
        })
    })

    describe('sources', () => {
        it('adds and removes sources', () => {
            collections.sources.add('Source A')
            expect(collections.sourcesSet.has('Source A')).toBe(true)

            collections.sources.remove('Source A')
            expect(collections.sourcesSet.has('Source A')).toBe(false)
        })
    })

    describe('matches', () => {
        it('adds match records', () => {
            const match = { score: 95 } as any
            collections.matches.add(match)
            expect(collections.fusionMatches).toContain(match)
            expect(collections.fusionMatches.length).toBe(1)
        })
    })

    describe('history', () => {
        it('imports history from array', () => {
            collections.historyOps.importFromArray(['[2026-01-01] event one', '[2026-01-02] event two'])
            expect(collections.history).toContain('[2026-01-01] event one')
            expect(collections.history).toContain('[2026-01-02] event two')
        })

        it('adds history via addHistoryMessage', () => {
            const previousLength = collections.history.length
            collections.addHistoryMessage('test history message')
            expect(collections.history.length).toBeGreaterThan(previousLength)
            expect(collections.history.some((h) => h.includes('test history message'))).toBe(true)
        })
    })

    describe('syncToBag', () => {
        it('writes all collection state to an attribute bag', () => {
            collections.accounts.add('src-a::acc-1')
            collections.accounts.addMissing('src-a::missing-1')
            collections.statuses.add('baseline')
            collections.actions.add('correlated')
            collections.reviews.add('https://review/1')
            collections.sources.add('Source A')

            const bag: Record<string, any> = {}
            collections.syncToBag(bag, 'Identities', 'id-1', 'identity-123')

            expect(bag['accounts']).toContain('src-a::acc-1')
            expect(bag['missing-accounts']).toContain('src-a::missing-1')
            expect(bag['statuses']).toContain('baseline')
            expect(bag['actions']).toContain('correlated')
            expect(bag['reviews']).toContain('https://review/1')
            expect(bag['identityId']).toBe('identity-123')
            expect(bag['originSource']).toBe('Identities')
            expect(bag['originAccount']).toBe('id-1')
        })
    })
})

