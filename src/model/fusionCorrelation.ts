import { FusionAction } from './fusionAction'
import { StatusEntitlement } from './statusEntitlement'
import type { FusionCollections } from './fusionCollections'

export class FusionCorrelation {
    private _correlationPromises: Array<Promise<unknown>> = []

    constructor(private readonly collections: FusionCollections) {}

    get promises(): readonly Promise<unknown>[] {
        return this._correlationPromises
    }

    addPromise(_accountId: string, promise: Promise<unknown>): void {
        if (!promise) return
        this._correlationPromises.push(promise)
    }

    updateStatus(setUncorrelated?: (v: boolean) => void): void {
        const hasAllAccountsCorrelated = this.collections.missingAccountIds.size === 0

        if (hasAllAccountsCorrelated) {
            this.collections._internal_statuses.delete(StatusEntitlement.Uncorrelated)
            this.collections._internal_actions.add(FusionAction.Correlated)
            if (setUncorrelated) setUncorrelated(false)
        } else {
            this.collections._internal_statuses.add(StatusEntitlement.Uncorrelated)
            this.collections._internal_actions.delete(FusionAction.Correlated)
            if (setUncorrelated) setUncorrelated(true)
        }
    }

    markCorrelated(accountId: string, promise?: Promise<unknown>): void {
        this.collections.accounts.add(accountId)
        this.collections.accounts.removeMissing(accountId)
        if (promise) {
            this.addPromise(accountId, promise)
        }
    }

    private async _resolveReviewPromises(): Promise<void> {
        const promises = this.collections.reviewPromises
        if (promises.length === 0) return

        const reviewResults = await Promise.allSettled(promises)
        for (const result of reviewResults) {
            if (result.status === 'fulfilled' && result.value) {
                this.collections.reviews.addPendingUrl(result.value)
            }
        }
    }

    private async _resolveCorrelationPromises(): Promise<void> {
        if (this._correlationPromises.length === 0) return
        await Promise.allSettled(this._correlationPromises)
        this._correlationPromises = []
    }

    resolvePendingReviewUrls(): void {
        const pendingUrls = this.collections.pendingReviewUrls
        if (pendingUrls.size === 0) return

        for (const url of pendingUrls) {
            this.collections.reviews.addFusionReview(url)
        }
    }

    async resolvePendingOperations(awaitCorrelations = true): Promise<void> {
        await this._resolveReviewPromises()
        if (awaitCorrelations) {
            await this._resolveCorrelationPromises()
        }
        this.resolvePendingReviewUrls()
    }
}
