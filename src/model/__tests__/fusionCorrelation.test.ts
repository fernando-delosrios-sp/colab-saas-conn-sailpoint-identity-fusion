import { describe, it, expect, beforeEach } from 'vitest'
import { FusionCollections } from '../fusionCollections'
import { FusionCorrelation } from '../fusionCorrelation'

describe('FusionCorrelation', () => {
    let collections: FusionCollections
    let correlation: FusionCorrelation
    let uncorrelatedFlag: boolean

    beforeEach(() => {
        collections = new FusionCollections(50)
        correlation = new FusionCorrelation(collections)
        uncorrelatedFlag = true
    })

    describe('addPromise', () => {
        it('tracks correlation promises', () => {
            const promise = Promise.resolve('ok')
            correlation.addPromise('acct-1', promise)
            expect(correlation.promises.length).toBe(1)
        })

        it('ignores nullish promises', () => {
            correlation.addPromise('acct-1', null as any)
            expect(correlation.promises.length).toBe(0)
        })
    })

    describe('updateStatus', () => {
        it('sets correlated when no missing accounts remain', () => {
            correlation.updateStatus((v) => { uncorrelatedFlag = v })
            expect(collections.statusesSet.has('uncorrelated')).toBe(false)
            expect(collections.actionsSet.has('correlated')).toBe(true)
            expect(uncorrelatedFlag).toBe(false)
        })

        it('sets uncorrelated when missing accounts exist', () => {
            collections.accounts.addMissing('src-a::missing-1')
            correlation.updateStatus((v) => { uncorrelatedFlag = v })
            expect(collections.statusesSet.has('uncorrelated')).toBe(true)
            expect(collections.actionsSet.has('correlated')).toBe(false)
            expect(uncorrelatedFlag).toBe(true)
        })

        it('invokes onCorrelatedActionGranted only on transition into correlated state', () => {
            let grantCount = 0
            const onGranted = () => {
                grantCount++
            }

            correlation.updateStatus(undefined, onGranted)
            expect(grantCount).toBe(1)

            correlation.updateStatus(undefined, onGranted)
            expect(grantCount).toBe(1)

            collections.accounts.addMissing('src-a::missing-1')
            correlation.updateStatus(undefined, onGranted)
            expect(grantCount).toBe(1)

            collections.accounts.removeMissing('src-a::missing-1')
            correlation.updateStatus(undefined, onGranted)
            expect(grantCount).toBe(2)
        })
    })

    describe('markCorrelated', () => {
        it('adds to correlated and removes from missing', () => {
            collections.accounts.addMissing('src-a::native-1')
            correlation.markCorrelated('src-a::native-1')
            expect(collections.accountIds.has('src-a::native-1')).toBe(true)
            expect(collections.missingAccountIds.has('src-a::native-1')).toBe(false)
        })

        it('tracks optional promise', () => {
            const promise = Promise.resolve()
            correlation.markCorrelated('src-a::native-1', promise)
            expect(correlation.promises.length).toBe(1)
        })
    })

    describe('resolvePendingReviewUrls', () => {
        it('copies pending URLs to active fusion reviews', () => {
            collections.reviews.addPendingUrl('https://fusion/1')
            collections.reviews.addPendingUrl('https://fusion/2')

            correlation.resolvePendingReviewUrls()

            expect(collections.reviewsSet.has('https://fusion/1')).toBe(true)
            expect(collections.reviewsSet.has('https://fusion/2')).toBe(true)
            expect(collections.pendingReviewUrls.size).toBe(2)
        })
    })

    describe('resolvePendingOperations', () => {
        it('resolves review promises and copies pending URLs', async () => {
            const reviewPromise = Promise.resolve('https://fusion/new')
            collections.reviews.addPromise(reviewPromise)

            await correlation.resolvePendingOperations()

            expect(collections.reviewsSet.has('https://fusion/new')).toBe(true)
        })
    })
})

