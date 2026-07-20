import { IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from '../../model/account'
import { FusionDecision } from '../../model/form'
import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { SourceType } from '../../model/config'
import { normalizeCompositeManagedAccountKey } from '../../model/managedAccountKey'
import { StatusEntitlement } from '../../model/statusEntitlement'
import { trimStr } from '../../utils/safeRead'
import { compact } from './collections'
import { batchProcess } from './collections'
import { FusionService } from './fusionService'
import { FusionRun } from '../../model/fusionRun'

export class DecisionProcessor {
    constructor(
        private config: FusionConfig,
        private log: LogService,
        private run: FusionRun,
        private fusionService: FusionService
    ) {}

    /**
     * Reconcile transient entitlements derived from pending form instances.
     *
     * This is intended for StdAccountList runs:
     * - Clears any persisted/stale 'candidate' and reviewer 'reviews'
     * - Re-applies them only from currently-known pending (unanswered) form instances
     *
     * This is necessary because not all identities may originate from existing fusion accounts
     * (some can be created from Identity documents), and those would otherwise retain stale values.
     */
    public reconcilePendingFormState(): void {
        const pendingCandidateIds = this.fusionService.forms.pendingCandidateIdentityIds
        const { pendingReviewUrlsByReviewerId } = this.fusionService.forms
        const pendingReviewUrlsByCandidateId = this.fusionService.forms.pendingReviewUrlsByCandidateId ?? new Map<string, string[]>()
        const candidateIdsNeedingStatus = new Set<string>(pendingCandidateIds)
        for (const id of pendingReviewUrlsByCandidateId.keys()) {
            candidateIdsNeedingStatus.add(id)
        }

        // Clear stale transient state, re-apply candidate statuses, and sync attributes.
        for (const account of this.run.fusionAccountMap.values()) {
            account.removeStatus(StatusEntitlement.Candidate)
            account.clearFusionReviews()

            const iid = account.identityId
            if (iid && candidateIdsNeedingStatus.has(iid)) {
                account.addStatus(StatusEntitlement.Candidate)
            }

            account.syncCollectionAttributesToBag()
        }

        for (const [identityId, identity] of this.run.fusionIdentityMap.entries()) {
            identity.removeStatus(StatusEntitlement.Candidate)
            identity.clearFusionReviews()

            if (candidateIdsNeedingStatus.has(identityId)) {
                identity.addStatus(StatusEntitlement.Candidate)
            }

            const urls = pendingReviewUrlsByReviewerId.get(identityId)
            if (urls?.length) {
                for (const url of urls) {
                    identity.addFusionReview(url)
                }
            }

            identity.syncCollectionAttributesToBag()
        }
    }

    /**
     * Refresh pending form data and reconcile transient candidate/reviewer output state
     * for the single account being processed.
     *
     * Single-account operations (create/read/enable/disable) handle one identity at a time,
     * but the shared form/decision state can carry transient 'candidate' and reviewer
     * 'reviews' entries from other accounts processed in the same lifecycle. Before
     * serializing the ISC account output, this method:
     * 1. Re-fetches the latest pending form instances via {@link FusionForms.fetchFormData}
     *    so the current account's pending decisions are reflected.
     * 2. Calls {@link reconcilePendingFormState} to drop stale 'candidate' / 'reviews'
     *    entries (which may reference accounts not present in this run) and
     *    rebuild them from the currently-known pending (unanswered) form instances,
     *    so the serialized output only references the account being returned.
     */
    public async normalizePendingFormStateForOutput(): Promise<void> {
        this.fusionService.log.info('Normalizing pending form state for output (candidates + reviewer links)')
        await this.fusionService.forms.fetchFormData()
        this.reconcilePendingFormState()
    }

    /**
     * Process all fusion identity decisions (new identity).
     * Candidate status is handled by processFusionAccounts, since pending form
     * candidates are always existing fusion accounts.
     *
     * @returns The fusion accounts produced by the new identity decisions
     */
    public async processFusionIdentityDecisions(): Promise<FusionAccount[]> {
        const { fusionIdentityDecisions } = this.fusionService.forms
        this.fusionService.log.info(
            `Processing fusion identity decisions: applying ${fusionIdentityDecisions.length} reviewer form decision(s) (new identity or merge into existing)`
        )

        const results = await batchProcess(fusionIdentityDecisions, 'Fusion identity decisions', (x) =>
            this.processFusionIdentityDecision(x), this.config, this.log
        )
        this.fusionService.log.info(`Fusion identity decisions phase finished: ${fusionIdentityDecisions.length} decision(s) applied`)
        return compact(results)
    }

    /**
     * Processes a single fusion identity decision (reviewer form response).
     * Creates a new fusion identity for "new identity" decisions, or merges
     * into an existing one for "authorized" decisions.
     *
     * @param fusionDecision - The reviewer's decision from the review form
     * @returns The fusion account produced or updated, or undefined if the decision was skipped
     */
    public async processFusionIdentityDecision(fusionDecision: FusionDecision): Promise<FusionAccount | undefined> {
        const sourceType = fusionDecision.sourceType ?? SourceType.Authoritative

        // Enrich submitter and selected identity display names for user-facing output.
        await this.enrichDecisionSubmitter(fusionDecision)
        let selectedIdentity = await this.enrichDecisionIdentityName(fusionDecision)

        const isAuthorizedDecision = !fusionDecision.newIdentity
        const existingIdentityAccount =
            isAuthorizedDecision && fusionDecision.identityId
                ? this.run.fusionIdentityMap.get(fusionDecision.identityId)
                : undefined
        const fusionAccount = existingIdentityAccount ?? FusionAccount.fromFusionDecision(fusionDecision)
        this.fusionService.log.debug(
            `${existingIdentityAccount ? 'Reusing' : 'Created'} fusion account from decision: ` +
                `${fusionDecision.account.name} [${fusionDecision.account.sourceName}], ` +
                `newIdentity=${fusionDecision.newIdentity}, sourceType=${sourceType}`
        )

        if (isAuthorizedDecision && fusionDecision.identityId) {
            if (!selectedIdentity) {
                selectedIdentity = await this.resolveIdentityBestEffort(fusionDecision.identityId)
            }
            if (selectedIdentity) {
                fusionAccount.addIdentityLayer(selectedIdentity)
            }
        }

        fusionAccount.setNeedsReset(Boolean(fusionDecision.newIdentity))
        fusionAccount.addFusionDecisionLayer(fusionDecision)

        const rawDecisionKey = trimStr(fusionDecision.account.id) ?? ''
        const normalizedDecisionKey = normalizeCompositeManagedAccountKey(rawDecisionKey)
        const skipBlendHistoryForManagedKeys = normalizedDecisionKey
            ? new Set([normalizedDecisionKey])
            : undefined

        fusionAccount.addManagedAccountLayer(
            this.fusionService.run,
            this.fusionService.sources.managedAccountsAllById,
            {
                pruneDeleted: this.fusionService.shouldPruneDeletedManagedAccounts(),
                skipBlendHistoryForManagedKeys,
                onBlend: (account) => this.fusionService.registerFusionBlend(fusionAccount, account),
            }
        )
        await this.fusionService.applyAttributeProcessing(fusionAccount)

        if (isAuthorizedDecision) {
            await this.fusionService.correlationManager.applyPerSourceCorrelationIfNeeded(fusionAccount, fusionDecision)
            fusionAccount.updateCorrelationStatus()
            this.fusionService.setFusionAccount(fusionAccount)
        }

        if (fusionDecision.newIdentity) {
            const sourceInfo = this.fusionService.sourcesByName.get(fusionDecision.account.sourceName)
            const decisionManagedKey = trimStr(fusionDecision.account.id) ?? ''
            const managedAccount = decisionManagedKey
                ? this.fusionService.run.managedAccountsById.get(decisionManagedKey)
                : undefined
            if (await this.fusionService.handleNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, managedAccount)) {
                if (sourceType === SourceType.Record) {
                    this.fusionService.log.debug(
                        `Record no-match decision for ${fusionDecision.account.name}, registering unique attributes only`
                    )
                } else if (sourceType === SourceType.Orphan) {
                    this.fusionService.log.debug(`Orphan no-match decision for ${fusionDecision.account.name}, dropping`)
                }
                return undefined
            }
            this.fusionService.setFusionAccount(fusionAccount)
            this.fusionService.log.debug(
                `Registered decision account as fusion account: ${fusionDecision.account.name} ` +
                    `[${fusionDecision.account.sourceName}] (key ${fusionDecision.account.id})`
            )
        }
        return fusionAccount
    }

    /**
     * Best-effort: enrich the submitter's display name from the identity cache (or live API in aggregation mode).
     * Mutates `decision.submitter.name` in-place when a label is found.
     */
    private async enrichDecisionSubmitter(decision: FusionDecision): Promise<void> {
        const submitterId = decision.submitter?.id
        if (!submitterId) return
        if (decision.submitter?.name || decision.submitter?.email) return

        try {
            const identity = await this.resolveIdentityBestEffort(submitterId)
            const label = identity?.displayName || identity?.name
            if (label) {
                decision.submitter.name = label
            }
        } catch {
            // Best-effort: fall back to submitterId if fetch fails
        }
    }

    /**
     * Best-effort: enrich the decision's `identityName` from the identity cache.
     * Returns the resolved identity document (if any) so the caller can reuse it
     * for the identity layer without a second lookup.
     */
    private async enrichDecisionIdentityName(decision: FusionDecision): Promise<IdentityDocument | undefined> {
        if (!decision.identityId || decision.identityName) return undefined

        try {
            const identity = this.fusionService.identities.getIdentityById(decision.identityId)
            const label = identity?.displayName || identity?.name
            if (label) {
                decision.identityName = label
            }
            return identity
        } catch {
            return undefined
        }
    }

    /**
     * Resolve an identity by ID: returns the cached document if available, otherwise
     * makes a live API call only during aggregation (non-aggregation modes are read-only).
     */
    private async resolveIdentityBestEffort(identityId: string): Promise<IdentityDocument | undefined> {
        try {
            const cached = this.fusionService.identities.getIdentityById(identityId)
            if (cached) return cached
            return this.fusionService.isAggregationAccountListMode() ? this.fusionService.identities.fetchIdentityById(identityId) : undefined
        } catch {
            return undefined
        }
    }
}
