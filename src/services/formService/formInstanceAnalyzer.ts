import { FormInstanceResponseV2025 } from 'sailpoint-api-client'
import { assert } from '../../utils/assert'
import { normalizeCompositeManagedAccountKey } from '../../model/managedAccountKey'
import { extractAccountInfoFromFormInput } from './formProcessor'
import { LogService } from '../logService'

// ============================================================================
// Types
// ============================================================================

export type FormInstanceAnalysisResult = {
    instancesToProcess: FormInstanceResponseV2025[]
    shouldDeleteForm: boolean
    formDefinitionId: string | undefined
    accountId: string | undefined
    processedCount: number
    /**
     * Indicates whether the managed account should be removed from the
     * managedAccountsById map to avoid further processing on next runs.
     *
     * Rules:
     * - While there is no response instance (COMPLETED/IN_PROGRESS/SUBMITTED), the form
     *   is kept but the managed account is removed from the map so we don't
     *   try to create another form for it.
     * - When there's a response instance, the form is deleted and the managed
     *   account is kept to support decision processing.
     * - When all instances have been cancelled, the form is deleted and the
     *   managed account is kept so a new form can be created later if needed.
     */
    shouldRemoveAccountFromMap: boolean
}

export type FormInstanceAnalyzerDeps = {
    log: LogService
    hasManagedAccount: (accountId: string) => boolean
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract account ID from form instance input
 */
export const extractAccountIdFromInstance = (instance: FormInstanceResponseV2025): string | undefined => {
    const accountInfo = extractAccountInfoFromFormInput(instance.formInput)
    const accountId = accountInfo?.id
    return accountId ? normalizeCompositeManagedAccountKey(accountId) : undefined
}

/**
 * Analyze form instances to determine which to process and extract metadata
 */
export const analyzeFormInstances = (
    formInstances: FormInstanceResponseV2025[],
    deps: FormInstanceAnalyzerDeps
): FormInstanceAnalysisResult => {
    // Default: keep the form until we see a response or learn all instances
    // were cancelled, in which case we can safely delete the form.
    let shouldDeleteForm = false
    let processedCount = 0
    let formDefinitionId: string | undefined = undefined
    let accountId: string | undefined = undefined
    const instancesToProcess: FormInstanceResponseV2025[] = []

    let hasResponseInstance = false
    let anyInstance = false
    let allInstancesCancelled = true

    for (const instance of formInstances) {
        assert(instance, 'Form instance is required')
        assert(instance.state, 'Form instance state is required')

        formDefinitionId = formDefinitionId || instance.formDefinitionId
        accountId = accountId || extractAccountIdFromInstance(instance)

        anyInstance = true

        // Track high-level state for account/form lifecycle decisions,
        // and collect only "response" instances for decision processing.
        switch (instance.state) {
            case 'COMPLETED':
            case 'IN_PROGRESS':
            case 'SUBMITTED':
                deps.log.debug(`Processing response form instance: ${instance.id}`)
                instancesToProcess.push(instance)
                processedCount++

                hasResponseInstance = true
                allInstancesCancelled = false
                // A single response instance is enough to decide the form's fate.
                shouldDeleteForm = true
                break

            case 'CANCELLED':
                deps.log.info(`Form instance ${instance.id} was cancelled`)
                processedCount++
                // Keep allInstancesCancelled = true only if we *only* see cancelled instances.
                break

            default:
                // Pending / other non-final states: keep the form, but don't
                // add them to processing, as they are not responses yet.
                deps.log.debug(`Form instance ${instance.id} has state: ${instance.state}, keeping form`)
                allInstancesCancelled = false
                break
        }

        // If we've already decided to delete the form due to a response,
        // no need to continue scanning the rest of the instances.
        if (shouldDeleteForm && hasResponseInstance) {
            break
        }
    }

    // Check if the managed account still exists - if not, delete the form
    if (accountId && !deps.hasManagedAccount(accountId)) {
        deps.log.info(`Managed account ${accountId} no longer exists, marking form for deletion`)
        shouldDeleteForm = true
    }

    // If we saw instances and *all* of them were cancelled, we can delete
    // the form but keep the account so a new form can be issued later.
    if (anyInstance && allInstancesCancelled) {
        shouldDeleteForm = true
    }

    // We only remove the account from the map while we are waiting for a
    // response: i.e. there is no response instance yet and not all
    // instances are cancelled (some are still pending / open).
    const shouldRemoveAccountFromMap = !hasResponseInstance && !allInstancesCancelled

    deps.log.debug(
        `Form analysis result: shouldDeleteForm=${shouldDeleteForm}, ` +
            `hasResponseInstance=${hasResponseInstance}, allInstancesCancelled=${allInstancesCancelled}, ` +
            `shouldRemoveAccountFromMap=${shouldRemoveAccountFromMap}`
    )

    return {
        instancesToProcess,
        shouldDeleteForm,
        formDefinitionId,
        accountId,
        processedCount,
        shouldRemoveAccountFromMap,
    }
}

