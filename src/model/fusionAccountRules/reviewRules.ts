import { FusionAccountState } from '../fusionAccountState'
import { StatusEntitlement } from '../statusEntitlement'
import { addToSet, removeFromSet } from './collectionRules'

/** Adds a review URL to the supplied state. */
export function addReview(state: FusionAccountState, review: string, message?: string): void {
    addToSet(state, state.reviews, review, message)
}

/** Removes a review URL from the supplied state. */
export function removeReview(state: FusionAccountState, review: string, message?: string): void {
    removeFromSet(state, state.reviews, review, message)
}

/** Adds a fusion review URL and sets the "activeReviews" status. */
export function addFusionReview(state: FusionAccountState, reviewUrl: string): void {
    state.reviews.add(reviewUrl)
    state.statuses.add(StatusEntitlement.ActiveReviews)
}

/** Removes a fusion review URL. Clears "activeReviews" status if no reviews remain. */
export function removeFusionReview(state: FusionAccountState, reviewUrl: string): void {
    state.reviews.delete(reviewUrl)
    if (state.reviews.size === 0) {
        state.statuses.delete(StatusEntitlement.ActiveReviews)
    }
}

/** Clear all fusion review URLs so they can be repopulated from the current run. */
export function clearFusionReviews(state: FusionAccountState): void {
    state.reviews.clear()
    state.statuses.delete(StatusEntitlement.ActiveReviews)
}

/** Queues a review URL for deferred addition (resolved during getISCAccount). */
export function addPendingReviewUrl(state: FusionAccountState, reviewUrl: string): void {
    if (reviewUrl) {
        state.pendingReviewUrls.add(reviewUrl)
    }
}

/** Adds a promise that will resolve to a review URL once the form is created. */
export function addReviewPromise(state: FusionAccountState, promise: Promise<string | undefined>): void {
    if (promise) {
        state.reviewPromises.push(promise)
    }
}

/** Converts all pending review URLs into active fusion reviews. */
export function resolvePendingReviewUrls(state: FusionAccountState): void {
    if (state.pendingReviewUrls.size === 0) return

    for (const url of state.pendingReviewUrls) {
        addFusionReview(state, url)
    }
    state.pendingReviewUrls.clear()
}

/** Resolves all pending review promises. */
export async function resolveReviewPromises(state: FusionAccountState): Promise<void> {
    if (state.reviewPromises.length === 0) return

    const reviewResults = await Promise.allSettled(state.reviewPromises)
    state.reviewPromises = []

    for (const result of reviewResults) {
        if (result.status === 'fulfilled' && result.value) {
            addPendingReviewUrl(state, result.value)
        }
    }
}
