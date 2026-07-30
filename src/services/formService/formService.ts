import { promiseAllBatched } from '../fusionService/collections'
import {
    FormDefinitionResponseV2025,
    FormInstanceResponseV2025,
    FormInstanceResponseV2025StateV2025,
    CustomFormsV2025ApiCreateFormDefinitionRequest,
} from 'sailpoint-api-client'
import { FusionConfig, SourceType } from '../../model/config'
import { ClientService } from '../clientService'
import { LogService } from '../logService'
import { IdentityService } from '../identityService'
import { EmailService } from '../emailService'
import { SourceService } from '../sourceService'
import { FusionRun } from '../../model/fusionRun'
import { assert, softAssert } from '../../utils/assert'
import { readString, readUnknown, trimStr } from '../../utils/safeRead'
import { FusionDecision } from '../../model/form'
import { FusionAccount } from '../../model/account'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import {
    Candidate,
    CreateFusionFormOutcome,
    PendingReviewFormContext,
    PendingReviewReviewerContext,
    PendingReviewAccountContext,
} from './types'
import { resolveFusionMaxCandidatesForForm } from '../../data/config'
import {
    buildCandidateList,
    buildFormName,
    calculateExpirationDate,
    createAutomaticMergeDecision,
    resolveIdentitiesSelectLabel,
} from './helpers'
import { buildFormInput, buildFormFields, buildFormConditions, buildFormInputs } from './formBuilder'
import {
    createFusionDecision,
    extractAccountInfoFromFormInput,
    extractCandidateIdsFromFormInput,
    getReviewerInfo,
} from './formProcessor'
import { normalizeCompositeManagedAccountKey } from '../../model/managedAccountKey'
import { FormLifecycle } from './formLifecycle'
import { analyzeFormInstances } from './formInstanceAnalyzer'
import {
    formatDecisionCountsSegment,
    logFusionDecisionDiscovered,
    summarizeDecisionCounts,
} from '../fusionService/decisionLogging'

export type { PendingReviewFormContext,  PendingReviewAccountContext } from './types'

// ============================================================================
// FormService Class
// ============================================================================

export interface FormFetchOptions {
    /** When true, stale form definitions are queued for deletion and skipped during instance fetch. */
    staleFormCleanup?: boolean
}

/**
 * Service for form definition and instance management.
 * Handles creation, processing, and cleanup of fusion forms for Match review.
 */
export class FormService {
    private readonly formDeleteQueueConcurrency = 1
    private fusionMergeDecisionMap: Map<string, FusionDecision> = new Map()
    /** Pending (unanswered) form instance URLs by recipient identityId, populated during fetchFormData. */
    private _pendingReviewContextByAccountId: Map<
        string,
        { forms: Map<string, PendingReviewFormContext>; reviewerIds: Set<string>; candidateIds: Set<string> }
    > = new Map()
    /** Finished decisions processed from answered form instances (assignment + newIdentity/no-match). */
    private _finishedFusionDecisions: FusionDecision[] = []
    private _fetchedFormInstances: FormInstanceResponseV2025[][] = []
    private readonly fusionFormNamePattern: string
    private readonly fusionFormExpirationDays: number
    private readonly fusionFormAttributes?: string[]
    private readonly fusionMaxCandidatesForForm: number
    private readonly lifecycle: FormLifecycle

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    constructor(
        config: FusionConfig,
        private log: LogService,
        private client: ClientService,
        private sources: SourceService,
        private identities?: IdentityService,
        private email?: EmailService,
        private run: FusionRun = new FusionRun()
    ) {
        this.fusionFormNamePattern = config.fusionFormNamePattern
        this.fusionFormExpirationDays = config.fusionFormExpirationDays
        this.fusionFormAttributes = config.fusionFormAttributes
        this.fusionMaxCandidatesForForm = resolveFusionMaxCandidatesForForm(config.fusionMaxCandidatesForForm)
        this.lifecycle = new FormLifecycle({
            client: this.client,
            log: this.log,
            run: this.run,
            fusionFormExpirationDays: this.fusionFormExpirationDays,
            formDeleteQueueConcurrency: this.formDeleteQueueConcurrency,
        })
    }

    // ------------------------------------------------------------------------
    // Public Methods
    // ------------------------------------------------------------------------

    /**
     * Fetch and process form data from completed form instances
     */
    public async fetchFormData(): Promise<void> {
        await this.fetchFormInstances()
        await this.processFetchedFormData()
    }

    private partitionStaleForms(
        forms: FormDefinitionResponseV2025[]
    ): { activeForms: FormDefinitionResponseV2025[]; staleForms: FormDefinitionResponseV2025[] } {
        const staleForms: FormDefinitionResponseV2025[] = []
        const activeForms: FormDefinitionResponseV2025[] = []
        for (const form of forms) {
            if (this.isFormDefinitionStale(form)) {
                staleForms.push(form)
            } else {
                activeForms.push(form)
            }
        }
        return { activeForms, staleForms }
    }

    private queueStaleFormDeletions(staleForms: FormDefinitionResponseV2025[]): void {
        for (const staleForm of staleForms) {
            const staleFormId = staleForm.id
            if (!staleFormId) continue
            this.log.info(
                `Form definition ${staleFormId} is older than ${this.fusionFormExpirationDays} day(s), queuing deletion`
            )
            this.addFormToDelete(staleFormId)
        }
    }

    /**
     * Fetch form definitions and their instances, deferring decision processing.
     */
    public async fetchFormInstances(options?: FormFetchOptions): Promise<void> {
        this.log.debug('Fetching form data')
        assert(this.fusionFormNamePattern, 'Fusion form name pattern is required')
        this.resetFormDataState()

        const forms = await this.findFormDefinitionsByName(this.fusionFormNamePattern)
        let activeForms = forms
        if (options?.staleFormCleanup) {
            const partitioned = this.partitionStaleForms(forms)
            activeForms = partitioned.activeForms
            this.log.debug(
                `Fetched ${forms.length} form definition(s) for pattern: ${this.fusionFormNamePattern} ` +
                    `(active=${partitioned.activeForms.length}, stale=${partitioned.staleForms.length})`
            )
            this.queueStaleFormDeletions(partitioned.staleForms)
        } else {
            this.log.debug(
                `Fetched ${forms.length} form definition(s) for pattern: ${this.fusionFormNamePattern} ` +
                    '(stale cleanup disabled for this run)'
            )
        }
        this.run.formsFound = activeForms.length

        // ⚡ Bolt: Replace unbounded Promise.all mapping with bounded promiseAllBatched
        // to prevent API rate limiting issues when iterating over a large number of forms
        if (activeForms.length === 0) {
            this._fetchedFormInstances = []
            this.log.debug('Fetched 0 instance(s) from 0 form definition(s)')
            return
        }

        const fetchInstancesOp = this.log.track('FormService.fetchFormInstances')
        let formsProcessed = 0
        let instanceCount = 0

        this._fetchedFormInstances = await promiseAllBatched(activeForms, async (form) => {
            const instances = await this.fetchFormInstancesByDefinitionId(form.id)
            formsProcessed++
            instanceCount += instances.length
            this.log.setProgress(formsProcessed, activeForms.length, 'forms')
            return instances
        })

        this.log.debug(
            `Fetched ${instanceCount} instance(s) from ${activeForms.length} form definition(s)`
        )
        fetchInstancesOp.done({ definitions: activeForms.length, instances: instanceCount })
    }

    /**
     * Process form instances that were fetched by fetchFormInstances.
     */
    public async processFetchedFormData(): Promise<void> {
        const formInstancesResults = this._fetchedFormInstances

        // Process all instances (single pass) to:
        // - extract assignment/new-identity decisions
        // - collect pending review URLs + pending candidate IDs
        // - queue resolved/orphaned forms for deletion
        // (fetching was done in parallel above, processing is fast so sequential is fine)
        for (const instances of formInstancesResults) {
            this.run.formInstancesFound += instances.length
            if (instances.length > 0) {
                await this.processFusionFormInstances(instances)
            }
        }
        this._fetchedFormInstances = []

        const fusionDecisionsCount = this.run.fusionIdentityDecisions.length
        this.log.debug(`Form data fetch completed - ${fusionDecisionsCount} fusion decision(s)`)
    }

    private resetFormDataState(): void {
        this.run.clearDecisions()
        this.fusionMergeDecisionMap = new Map()
        this.run.clearReviewUrls()
        this._pendingReviewContextByAccountId = new Map()
        this._finishedFusionDecisions = []
        this.run.formsFound = 0
        this.run.formInstancesFound = 0
        this.run.answeredFormInstancesProcessed = 0
        this._fetchedFormInstances = []
    }

    public async deleteExistingForms(): Promise<void> {
        const forms = await this.findFormDefinitionsByName(this.fusionFormNamePattern)
        await promiseAllBatched(forms, (form) => this.deleteFormDefinition(form.id!))
    }

    /**
     * Clean up completed and cancelled forms
     */
    public async cleanUpForms(): Promise<void> {
        if (this.run.formsToDelete.size === 0) {
            this.log.debug('No forms to clean up')
            return
        }

        // Snapshot and clear the transient list up front so producers can keep enqueueing
        // while this cleanup pass deduplicates and schedules the current batch.
        const formIdsToQueue = Array.from(this.run.formsToDelete)
        this.run.formsToDelete = new Set()

        let queuedCount = 0
        for (const formId of formIdsToQueue) {
            if (this.run.queuedFormDeleteIds.has(formId)) {
                continue
            }
            this.run.queuedFormDeleteIds.add(formId)
            this.run.formDeleteQueue.push(formId)
            queuedCount++
        }

        if (queuedCount === 0) {
            this.log.debug('No new forms were queued for cleanup')
            return
        }

        this.log.info(`Queued ${queuedCount} form(s) for low-priority cleanup`)
        this.kickoffFormDeleteWorkers()
    }

    /**
     * Wait for all queued form-deletion work to complete.
     * Called at the end of the pipeline so process flow remains non-blocking mid-run.
     */
    public async awaitPendingDeleteOperations(): Promise<void> {
        if (this.run.pendingFormDeleteTasks.size === 0 && this.run.formDeleteQueue.length === 0) {
            this.log.debug('No pending form deletions to await')
            return
        }

        this.log.info('Waiting for queued form deletions to complete')
        while (this.run.pendingFormDeleteTasks.size > 0 || this.run.formDeleteQueue.length > 0) {
            this.kickoffFormDeleteWorkers()
            if (this.run.pendingFormDeleteTasks.size > 0) {
                await Promise.all(Array.from(this.run.pendingFormDeleteTasks))
            }
        }
        this.log.debug('All queued form deletions completed')
    }

    /**
     * Create a fusion form for Match review.
     */
    public async createFusionForm(
        fusionAccount: FusionAccount,
        reviewers: Set<FusionAccount> | undefined
    ): Promise<CreateFusionFormOutcome> {
        assert(fusionAccount, 'Fusion account is required')

        if (!this.hasValidReviewers(reviewers, fusionAccount.name || 'Unknown')) {
            return { formDefinitionReady: false, newReviewInstancesQueued: 0 }
        }

        const { candidates, formDefinition, formInput, expire, fusionSourceId } = await this.prepareFormCreationData(
            fusionAccount,
            reviewers!.size
        )

        if (formDefinition) {
            const existingInstances = await this.fetchFormInstancesByDefinitionId(formDefinition.id)
            const existingRecipientIds = this.extractExistingRecipientIds(existingInstances)

            this.associateExistingInstancesWithReviewers(existingInstances, reviewers!)

            const newReviewInstancesQueued = await this.createFormInstancesForReviewers(
                reviewers!,
                formDefinition,
                formInput,
                fusionSourceId,
                expire,
                fusionAccount,
                candidates,
                existingRecipientIds
            )

            // Register candidate IDs from this newly-created form so that
            // reconcilePendingFormState can mark them as candidates even though
            // fetchFormData (which populates pendingCandidateIdentityIds) already ran.
            for (const candidate of candidates) {
                if (candidate.id) {
                    this.run.addPendingCandidateId(candidate.id)
                }
            }
            return { formDefinitionReady: true, newReviewInstancesQueued }
        }
        return { formDefinitionReady: false, newReviewInstancesQueued: 0 }
    }

    /**
     * Validate that reviewers exist and are not empty
     */
    private hasValidReviewers(reviewers: Set<FusionAccount> | undefined, accountName: string): boolean {
        if (!reviewers || reviewers.size === 0) {
            this.log.warn(`No reviewers found for account ${accountName}, skipping form creation`)
            return false
        }
        return true
    }

    /**
     * Prepare all data needed for form creation
     */
    private async prepareFormCreationData(
        fusionAccount: FusionAccount,
        reviewerCount: number
    ): Promise<{
        candidates: Candidate[]
        formName: string
        formDefinition: FormDefinitionResponseV2025 | undefined
        formInput: { [key: string]: any }
        expire: string
        fusionSourceId: string
    }> {
        this.log.debug(`Building fusion form for account ${fusionAccount.name} with ${reviewerCount} reviewer(s)`)

        const candidates = buildCandidateList(fusionAccount, this.fusionMaxCandidatesForForm)
        assert(candidates, 'Failed to build candidate list')

        await this.enrichCandidateIdentities(candidates)

        const sourceType =
            this.sources.getSourceByNameSafe(fusionAccount.sourceName)?.sourceType ?? SourceType.Authoritative

        const formName = buildFormName(fusionAccount, this.fusionFormNamePattern)
        assert(formName, 'Form name is required')

        const formDefinition = await this.getOrCreateFormDefinition(formName, fusionAccount, candidates)
        const formInput = buildFormInput(fusionAccount, candidates, this.fusionFormAttributes, sourceType)
        assert(formInput, 'Form input is required')

        const expire = calculateExpirationDate(this.fusionFormExpirationDays)
        assert(expire, 'Form expiration date is required')

        const { fusionSourceId } = this.sources
        assert(fusionSourceId, 'Fusion source ID is required')

        return { candidates, formName, formDefinition, formInput, expire, fusionSourceId }
    }

    /**
     * Enrich all candidates in a single pass:
     * - Aligns `candidate.name` with the identities SELECT primary label.
     * - Ensures `attributes.email` is populated for the identities SELECT sublabel.
     *
     * Fetches uncached identities in parallel (Promise.all) instead of sequentially,
     * and fetches each identity only once regardless of which fields are needed.
     */
    private async enrichCandidateIdentities(candidates: Candidate[]): Promise<void> {
        if (!this.identities) return

        const normalizeEmail = (value: unknown): string | undefined => {
            if (value === null || value === undefined) return undefined
            if (Array.isArray(value)) {
                for (const v of value) {
                    const normalized = normalizeEmail(v)
                    if (normalized) return normalized
                }
                return undefined
            }
            return trimStr(value)
        }

        // Collect IDs that are not already in cache so we can fetch them in parallel.
        const uncachedIds = candidates.filter((c) => !this.identities!.getIdentityById(c.id)).map((c) => c.id)

        if (uncachedIds.length > 0) {
            await promiseAllBatched(
                uncachedIds,
                (id) =>
                    this.identities!.fetchIdentityById(id).catch((error) => {
                        const detail = error instanceof Error ? error.message : String(error)
                        this.log.debug(`Could not load identity ${id} for candidate enrichment: ${detail}`)
                    }),
                50
            )
        }

        // Single pass: apply both name and email enrichment using the now-cached docs.
        for (const c of candidates) {
            const doc = this.identities.getIdentityById(c.id)
            const previousName = c.name
            const resolved = resolveIdentitiesSelectLabel(c.attributes, c.id, doc)
            c.name =
                resolved !== c.id
                    ? resolved
                    : previousName && previousName !== c.id
                      ? previousName
                      : resolved

            const existing = normalizeEmail(readUnknown(c.attributes, 'email'))
            if (existing) {
                ;(c.attributes as Record<string, unknown>).email = existing
                continue
            }

            if (doc) {
                const attrs = readUnknown(doc, 'attributes')
                const hydrated = normalizeEmail(
                    readUnknown(attrs, 'email') ?? readUnknown(attrs, 'mail') ?? readUnknown(attrs, 'emailAddress')
                )
                if (hydrated) {
                    ;(c.attributes as Record<string, unknown>).email = hydrated
                }
            }
        }
    }

    /**
     * Get existing form definition or create a new one
     */
    private async getOrCreateFormDefinition(
        formName: string,
        fusionAccount: FusionAccount,
        candidates: Candidate[]
    ): Promise<FormDefinitionResponseV2025 | undefined> {
        let formDefinition = await this.getFormDefinitionByName(formName)
        if (!formDefinition) {
            this.log.debug(`Form definition not found, creating new one: ${formName}`)
            try {
                formDefinition = await this.buildFusionFormDefinition(formName, fusionAccount, candidates)
            } catch (error) {
                if (this.isDuplicateFormDefinitionNameConflict(error)) {
                    this.log.warn(
                        `Form definition create conflict for name ${formName}; retrying lookup by exact name`
                    )
                    formDefinition = await this.getFormDefinitionByName(formName)
                }
                if (!formDefinition) {
                    throw error
                }
            }
            softAssert(formDefinition, 'Failed to create form definition')
            softAssert(formDefinition?.id, 'Form definition ID is required')
        } else {
            this.log.debug(`Using existing form definition: ${formDefinition.id}`)
        }
        return formDefinition
    }

    private isDuplicateFormDefinitionNameConflict(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false
        }
        const err = error as {
            message?: string
            status?: number
            response?: { status?: number; data?: { detailCode?: string; errorCode?: string; message?: string } }
        }
        const status = err.response?.status ?? err.status
        if (status === 409) {
            return true
        }
        const detailCode = err.response?.data?.detailCode ?? err.response?.data?.errorCode
        if (detailCode === '400.1.409') {
            return true
        }
        const message = String(err.message ?? err.response?.data?.message ?? '')
        return /another form definition with the same name already exists/i.test(message)
    }

    /**
     * Extract recipient IDs from existing form instances
     */
    private extractExistingRecipientIds(instances: FormInstanceResponseV2025[]): Set<string> {
        const recipientIds: string[] = []
        for (const instance of instances) {
            if (instance.recipients) {
                for (const recipient of instance.recipients) {
                    if (recipient.id) {
                        recipientIds.push(recipient.id)
                    }
                }
            }
        }
        return new Set(recipientIds)
    }

    /**
     * Associate existing form instances with their reviewers
     */
    private associateExistingInstancesWithReviewers(
        existingInstances: FormInstanceResponseV2025[],
        reviewers: Set<FusionAccount>
    ): void {
        const reviewerByIdentityId = new Map<string, FusionAccount>()
        for (const r of reviewers) {
            if (r.identityId) reviewerByIdentityId.set(r.identityId, r)
        }

        for (const instance of existingInstances) {
            if (!instance.state || !instance.recipients || !instance.standAloneFormUrl) continue
            const state = instance.state.toUpperCase()
            // Only pending instances should show up as active reviews on reviewer accounts.
            if (state === 'COMPLETED' || state === 'IN_PROGRESS' || state === 'SUBMITTED' || state === 'CANCELLED')
                continue

            for (const recipient of instance.recipients) {
                if (!recipient.id) {
                    continue
                }

                const reviewer = reviewerByIdentityId.get(recipient.id)
                if (reviewer) {
                    reviewer.addFusionReview(instance.standAloneFormUrl)
                    this.log.debug(`Added existing form instance ${instance.id} to reviewer ${recipient.id} reviews`)
                }
            }
        }
    }

    /**
     * Create form instances for each reviewer
     */
    private async createFormInstancesForReviewers(
        reviewers: Set<FusionAccount>,
        formDefinition: FormDefinitionResponseV2025,
        formInput: { [key: string]: any },
        fusionSourceId: string,
        expire: string,
        fusionAccount: FusionAccount,
        candidates: Candidate[],
        existingRecipientIds: Set<string>
    ): Promise<number> {
        let newReviewInstancesQueued = 0
        const reviewPromises: Promise<string | undefined>[] = []
        for (const reviewer of reviewers) {
            const reviewerId = reviewer.identityId
            if (!reviewerId) {
                this.log.warn(`Reviewer ${reviewer.name} has no identity ID, skipping`)
                continue
            }

            const hasPreviousInstance = existingRecipientIds.has(reviewerId)
            if (hasPreviousInstance) {
                this.log.debug(`Form instance already exists for reviewer ${reviewerId}`)
            } else {
                newReviewInstancesQueued++
            }

            const reviewPromise = this.createReviewPromise(
                formDefinition.id!,
                formInput,
                reviewerId,
                fusionSourceId,
                expire,
                fusionAccount,
                candidates,
                hasPreviousInstance
            )

            reviewer.addReviewPromise(reviewPromise)
            reviewPromises.push(reviewPromise)
        }
        if (reviewPromises.length > 0) {
            await Promise.allSettled(reviewPromises)
        }
        return newReviewInstancesQueued
    }

    /**
     * Create a promise that handles form instance creation and email notification
     */
    private createReviewPromise(
        formDefinitionId: string,
        formInput: { [key: string]: any },
        reviewerId: string,
        fusionSourceId: string,
        expire: string,
        fusionAccount: FusionAccount,
        candidates: Candidate[],
        hasPreviousInstance: boolean
    ): Promise<string | undefined> {
        return (async (): Promise<string | undefined> => {
            const formInstance = await this.createFormInstance(
                formDefinitionId,
                formInput,
                [reviewerId],
                fusionSourceId,
                expire
            )
            assert(formInstance, 'Failed to create form instance')

            if (!formInstance.id) {
                return undefined
            }

            this.log.debug(`Created form instance ${formInstance.id} for reviewer ${reviewerId}`)

            await this.sendFormInstanceNotificationIfEnabled(
                formInstance,
                fusionAccount,
                candidates,
                reviewerId,
                hasPreviousInstance
            )

            const url = formInstance.standAloneFormUrl ?? undefined
            if (url) {
                for (const c of candidates) {
                    if (!c.id) continue
                    this.run.addReviewUrlForCandidate(c.id, url)
                }
            }

            return url
        })()
    }

    /**
     * Send email notification for form instance if messaging is enabled
     */
    private async sendFormInstanceNotificationIfEnabled(
        formInstance: FormInstanceResponseV2025,
        fusionAccount: FusionAccount,
        candidates: Candidate[],
        reviewerId: string,
        hasPreviousInstance: boolean
    ): Promise<void> {
        if (!this.email) {
            return
        }

        if (this.run.isDryRunMode) {
            this.log.debug(`Skipping review email for form ${formInstance.id} — dry-run mode`)
            return
        }

        if (hasPreviousInstance) {
            this.log.debug(
                `Previous instance existed for reviewer ${reviewerId}; still sending review email for new instance ${formInstance.id}`
            )
        }

        try {
            const reportAccountId = fusionAccount.iscAccountId
            await this.email.sendFusionEmail(formInstance, {
                accountName: fusionAccount.name || fusionAccount.displayName || 'Unknown',
                accountSource: fusionAccount.sourceName,
                sourceType: this.sources.getSourceByNameSafe(fusionAccount.sourceName)?.sourceType,
                accountId: reportAccountId,
                accountEmail: fusionAccount.email,
                accountAttributes: fusionAccount.attributes as any,
                fusionMatches: fusionAccount.fusionMatches,
                maxCandidates: this.fusionMaxCandidatesForForm,
            })
            this.log.debug(`Email notification sent for form ${formInstance.id}`)
        } catch (error) {
            this.log.warn(`Failed to send email notification for form ${formInstance.id}: ${error}`)
        }
    }

    /** Number of form definitions created during this run */
    public get formsCreated(): number {
        return this.run.formsCreated
    }

    /** Number of form definitions found during fetchFormData for this run */
    public get formsFound(): number {
        return this.run.formsFound
    }

    /** Number of form instances (review assignments) created during this run */
    public get formInstancesCreated(): number {
        return this.run.formInstancesCreated
    }

    /** Number of form instances found during fetchFormData for this run */
    public get formInstancesFound(): number {
        return this.run.formInstancesFound
    }

    /** Number of answered form instances processed in this run */
    public get answeredFormInstancesProcessed(): number {
        return this.run.answeredFormInstancesProcessed
    }

    /** All finished decisions processed from answered form instances in this run */
    public get finishedFusionDecisions(): FusionDecision[] {
        return this._finishedFusionDecisions
    }

    /**
     * Registers a completed decision for reporting/metrics.
     * Optionally include it in the processing queue when it should be handled by
     * processFusionIdentityDecisions (new-identity/no-match decisions from forms).
     */
    public registerFinishedDecision(decision: FusionDecision, includeInProcessingQueue: boolean = false): void {
        this._finishedFusionDecisions.push(decision)
        if (!includeInProcessingQueue) return
        assert(this.run.fusionIdentityDecisions, 'Fusion identity decisions not fetched')
        this.run.addDecision(decision)
    }

    /**
     * Builds a synthetic fusion decision for automatic merge (exact match).
     * This is the FormService-owned entry point so callers depend on the service,
     * not on the helper function directly.
     */
    public createAutomaticMergeDecision(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): FusionDecision {
        return createAutomaticMergeDecision(fusionAccount, account, identityId)
    }

    /**
     * Get all fusion identity decisions
     */
    public getFusionIdentityDecision(identityUid: string): FusionDecision | undefined {
        const decisions = this.run.fusionIdentityDecisions
        if (decisions.length === 0) {
            return undefined
        }
        return decisions.find((decision) => decision.account.id === identityUid)
    }

    /**
     * Get merge fusion decision for an identity ID
     */
    public getFusionMergeDecision(identityId: string): FusionDecision | undefined {
        return this.fusionMergeDecisionMap.get(identityId)
    }

    /**
     * Fetch form instances by definition ID
     */
    public async fetchFormInstancesByDefinitionId(
        formDefinitionId?: string,
        onInstancesLoaded?: (delta: number) => void
    ): Promise<FormInstanceResponseV2025[]> {
        return this.lifecycle.fetchFormInstancesByDefinitionId(formDefinitionId, onInstancesLoaded)
    }

    /**
     * Set form instance state
     */
    public async setFormInstanceState(
        formInstanceID: string,
        state: FormInstanceResponseV2025StateV2025
    ): Promise<FormInstanceResponseV2025 | undefined> {
        return this.lifecycle.setFormInstanceState(formInstanceID, state)
    }

    public get pendingReviewContextByAccountId(): Map<string, PendingReviewAccountContext> {
        const output = new Map<string, PendingReviewAccountContext>()

        for (const [accountId, context] of this._pendingReviewContextByAccountId.entries()) {
            const reviewers = Array.from(context.reviewerIds)
                .map((reviewerId) => getReviewerInfo(reviewerId, this.identities))
                .filter(Boolean) as PendingReviewReviewerContext[]

            output.set(accountId, {
                forms: Array.from(context.forms.values()),
                reviewers,
                candidateIds: Array.from(context.candidateIds),
            })
        }

        return output
    }

    // ------------------------------------------------------------------------
    // Private Helper Methods
    // ------------------------------------------------------------------------


    /**
     * Collect pending (unanswered) form instance URLs by recipient identityId,
     * and candidate identity IDs from pending form instances.
     * Pending = state is not COMPLETED, IN_PROGRESS, SUBMITTED, or CANCELLED.
     * Kept so we can assign current review URLs to each reviewer when we process them,
     * and so we can apply the 'candidate' status to identities in pending reviews.
     */
    private collectPendingReviewUrlsByReviewer(formInstances: FormInstanceResponseV2025[]): void {
        for (const instance of formInstances) {
            if (!instance.state) continue
            const state = instance.state.toUpperCase()
            if (state === 'COMPLETED' || state === 'IN_PROGRESS' || state === 'SUBMITTED' || state === 'CANCELLED')
                continue
            if (!instance.recipients?.length) continue

            const accountInfo = extractAccountInfoFromFormInput(instance.formInput)
            const candidateIds = extractCandidateIdsFromFormInput(instance.formInput)
            const accountContext = accountInfo?.id
                ? this.getOrCreatePendingReviewAccountContext(accountInfo.id)
                : undefined

            for (const recipient of instance.recipients) {
                if (!recipient.id) continue
                if (instance.standAloneFormUrl) {
                    this.run.addReviewUrlForReviewer(recipient.id, instance.standAloneFormUrl)
                }
                accountContext?.reviewerIds.add(recipient.id)
            }

            // Extract candidate identity IDs from pending form instances.
            // The 'candidates' field is a comma-separated list of identity IDs
            // stored during form creation (see buildFormInput in formBuilder.ts).
            for (const candidateId of candidateIds) {
                this.run.addPendingCandidateId(candidateId)
                accountContext?.candidateIds.add(candidateId)
                if (instance.standAloneFormUrl) {
                    this.run.addReviewUrlForCandidate(candidateId, instance.standAloneFormUrl)
                }
            }

            if (accountContext && instance.id) {
                accountContext.forms.set(instance.id, {
                    formInstanceId: instance.id,
                    url: instance.standAloneFormUrl ?? undefined,
                })
            }
        }
    }

    private getOrCreatePendingReviewAccountContext(accountId: string): {
        forms: Map<string, PendingReviewFormContext>
        reviewerIds: Set<string>
        candidateIds: Set<string>
    } {
        let context = this._pendingReviewContextByAccountId.get(accountId)
        if (!context) {
            context = {
                forms: new Map<string, PendingReviewFormContext>(),
                reviewerIds: new Set<string>(),
                candidateIds: new Set<string>(),
            }
            this._pendingReviewContextByAccountId.set(accountId, context)
        }
        return context
    }

    /**
     * Process fusion form instances and extract decisions
     */
    private async processFusionFormInstances(formInstances: FormInstanceResponseV2025[]): Promise<void> {
        assert(Array.isArray(this.run.fusionIdentityDecisions), 'Fusion identity decisions array is not initialized')
        assert(this.fusionMergeDecisionMap, 'Fusion merge decision map is not initialized')
        assert(formInstances, 'Form instances array is required')

        const processingResult = analyzeFormInstances(formInstances, {
            log: this.log,
            hasManagedAccount: (accountId) => this.run.hasManagedAccount(accountId),
        })
        const accountInfoOverride = this.extractAccountInfoOverride(
            processingResult.accountId,
            processingResult.shouldRemoveAccountFromMap
        )

        const decisionsAdded = await this.createDecisionsFromInstances(
            processingResult.instancesToProcess,
            accountInfoOverride
        )
        this.run.answeredFormInstancesProcessed += processingResult.instancesToProcess.length

        // Only active (non-deleted) forms should contribute pending review URLs and candidate IDs.
        // A resolved/orphaned form may still have "pending" instances for other reviewers, but those
        // should not be treated as active reviews/candidates once the form is no longer actionable.
        if (!processingResult.shouldDeleteForm) {
            this.collectPendingReviewUrlsByReviewer(formInstances)
        } else if (processingResult.formDefinitionId) {
            this.addFormToDelete(processingResult.formDefinitionId)
        }

        if (decisionsAdded > 0) {
            const discovered = this._finishedFusionDecisions.slice(-decisionsAdded)
            const counts = summarizeDecisionCounts(discovered)
            this.log.detail({
                action: 'fusion decisions discovered from forms',
                count: decisionsAdded,
                decisions: formatDecisionCountsSegment(counts, true),
            })
        }
    }

    /**
     * Extract account info override from managed accounts and optionally
     * remove the account from the managed accounts map.
     *
     * The removal behaviour is controlled by shouldRemoveAccountFromMap,
     * which is derived from the instance analysis rules:
     * - No response and pending/open instances -> remove account from map
     * - All instances cancelled    -> keep account
     * - Response instance present  -> keep account
     */
    private extractAccountInfoOverride(
        accountId: string | undefined,
        shouldRemoveAccountFromMap: boolean
    ): { id: string; name: string; sourceName: string; sourceId?: string; nativeIdentity?: string } | undefined {
        if (!accountId) {
            return undefined
        }

        const normalizedAccountId = normalizeCompositeManagedAccountKey(accountId) ?? accountId
        const workQueue = this.run.managedAccountsById
        assert(workQueue, 'Managed accounts have not been loaded')

        const queueAccount = workQueue.get(normalizedAccountId)
        const info = queueAccount ? undefined : this.run.getManagedAccountInfo(normalizedAccountId)
        if (!queueAccount && !info && !this.run.hasManagedAccount(normalizedAccountId)) {
            return undefined
        }

        if (shouldRemoveAccountFromMap && this.run.hasManagedAccount(normalizedAccountId) && queueAccount) {
            const inventoryInfo = this.run.getManagedAccountInfo(normalizedAccountId)
            const claimIdentityId = queueAccount.identityId ?? inventoryInfo?.identityId
            this.sources.run.claimAccount(normalizedAccountId, claimIdentityId)
        }

        if (queueAccount) {
            return {
                id: normalizedAccountId,
                name: trimStr(queueAccount.name) || '',
                sourceName: queueAccount.sourceName || '',
                sourceId: readString(queueAccount, 'sourceId'),
                nativeIdentity: queueAccount.nativeIdentity ?? undefined,
            }
        }

        if (info) {
            return {
                id: normalizedAccountId,
                name: info.name,
                sourceName: info.sourceName,
                sourceId: info.sourceId,
                nativeIdentity: info.nativeIdentity,
            }
        }

        return {
            id: normalizedAccountId,
            name: '',
            sourceName: '',
        }
    }

    /**
     * Create fusion decisions from processed instances
     * @returns The number of decisions successfully created
     */
    private async createDecisionsFromInstances(
        instancesToProcess: FormInstanceResponseV2025[],
        accountInfoOverride:
            | { id: string; name: string; sourceName: string; sourceId?: string; nativeIdentity?: string }
            | undefined
    ): Promise<number> {
        let decisionsAdded = 0

        for (const instance of instancesToProcess) {
            const decision = await createFusionDecision(instance, this.identities, accountInfoOverride)
            if (!decision) {
                this.log.warn(`Failed to create fusion decision for form instance: ${instance.id}`)
                continue
            }

            if (decision.finished) {
                this.registerFinishedDecision(decision, decision.newIdentity)
                if (!decision.newIdentity) {
                    this.fusionMergeDecisionMap!.set(decision.identityId!, decision)
                }

                decisionsAdded++
                logFusionDecisionDiscovered(this.log, decision)
            }
        }

        return decisionsAdded
    }

    /**
     * Create a fusion form definition with appropriate fields
     */
    private async buildFusionFormDefinition(
        formName: string,
        fusionAccount: FusionAccount,
        candidates: Candidate[]
    ): Promise<FormDefinitionResponseV2025 | undefined> {
        if (candidates.length > this.fusionMaxCandidatesForForm) {
            this.log.error(
                `Candidates must be less than or equal to ${this.fusionMaxCandidatesForForm} (fusionMaxCandidatesForForm)`
            )
            return
        }
        const sourceType =
            this.sources.getSourceByNameSafe(fusionAccount.sourceName)?.sourceType ?? SourceType.Authoritative
        const formFields = buildFormFields(fusionAccount, candidates, this.fusionFormAttributes, sourceType)
        const formInputs = buildFormInputs(fusionAccount, candidates, this.fusionFormAttributes)
        const formConditions = buildFormConditions(candidates, this.fusionFormAttributes)
        const owner = this.sources.fusionSourceOwner

        // Validate form definition components before creating
        this.log.debug(
            `Form definition validation: fields=${formFields.length}, inputs=${formInputs.length}, conditions=${formConditions.length}`
        )

        assert(formFields && formFields.length > 0, 'Form fields must not be empty')
        assert(formInputs && formInputs.length > 0, 'Form inputs must not be empty')
        assert(owner, 'Form owner is required')
        assert(owner.id, 'Form owner ID is required')
        assert(owner.type, 'Form owner type is required')

        // Warn if form definition is very large (may cause API issues)
        if (formConditions.length > 500) {
            this.log.warn(`Form has ${formConditions.length} conditions - this may cause API performance issues`)
        }

        const formDefinition: CustomFormsV2025ApiCreateFormDefinitionRequest = {
            body: {
                name: formName,
                description:
                    'Review potential matching identity and decide whether to create a new identity or merge with an existing one',
                owner,
                formElements: formFields,
                formInput: formInputs,
                formConditions: formConditions as any,
            },
        }

        return await this.createFormDefinition(formDefinition)
    }


    // ------------------------------------------------------------------------
    // Lifecycle delegators (logic in formLifecycle.ts)
    // ------------------------------------------------------------------------

    private async findFormDefinitionsByName(namePattern: string): Promise<FormDefinitionResponseV2025[]> {
        return this.lifecycle.findFormDefinitionsByName(namePattern)
    }

    private async getFormDefinitionByName(formName: string): Promise<FormDefinitionResponseV2025 | undefined> {
        return this.lifecycle.getFormDefinitionByName(formName)
    }

    private async createFormDefinition(
        form: CustomFormsV2025ApiCreateFormDefinitionRequest
    ): Promise<FormDefinitionResponseV2025> {
        return this.lifecycle.createFormDefinition(form)
    }

    private async createFormInstance(
        formDefinitionId: string,
        formInput: { [key: string]: any },
        recipientList: string[],
        sourceId: string,
        expire: string
    ): Promise<FormInstanceResponseV2025> {
        return this.lifecycle.createFormInstance(formDefinitionId, formInput, recipientList, sourceId, expire)
    }

    private isFormDefinitionStale(form: FormDefinitionResponseV2025): boolean {
        return this.lifecycle.isFormDefinitionStale(form)
    }

    private addFormToDelete(formDefinitionId: string): void {
        this.lifecycle.addFormToDelete(formDefinitionId)
    }

    private kickoffFormDeleteWorkers(): void {
        this.lifecycle.kickoffFormDeleteWorkers()
    }

    /**
     * Delete a form definition
     */
    public async deleteFormDefinition(formDefinitionId: string): Promise<void> {
        return this.lifecycle.deleteFormDefinition(formDefinitionId)
    }
}
