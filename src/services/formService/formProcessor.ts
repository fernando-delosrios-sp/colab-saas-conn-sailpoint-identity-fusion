import { FormInstanceResponseV2025, FormDefinitionInputV2025 } from 'sailpoint-api-client'
import { logger } from '@sailpoint/connector-sdk'
import { SourceType } from '../../model/config'
import { FusionDecision } from '../../model/form'
import { IdentityService } from '../identityService'
import { assert } from '../../utils/assert'

// ============================================================================
// Form Processing Functions
// ============================================================================

/**
 * Get reviewer information from identity ID
 */
export const getReviewerInfo = (
    identityId: string,
    identities?: IdentityService
): { id: string; email: string; name: string } | undefined => {
    if (!identities) {
        return {
            id: identityId,
            email: '',
            name: '',
        }
    }

    const identity = identities.getIdentityById(identityId)
    if (!identity) {
        return {
            id: identityId,
            email: '',
            name: identityId,
        }
    }

    return {
        id: identityId,
        email: identity.attributes?.email || '',
        name: identity.attributes?.displayName || identity.name || identityId,
    }
}

/**
 * Extract account information from form input.
 * Handles both flat structure { account: "...", name: "...", source: "..." }
 * and dictionary structure where formInput is an object with input objects keyed by id.
 */
export const extractAccountInfoFromFormInput = (formInput: any): { id: string; name: string; sourceName: string } | null => {
    let accountId: string | undefined
    let accountName: string | undefined
    let accountSource: string | undefined

    // Try flat structure first (as sent in createFormInstance)
    if (typeof formInput.account === 'string') {
        accountId = formInput.account
        accountName = formInput.name
        accountSource = formInput.source
    } else if (formInput.account && typeof formInput.account === 'object' && formInput.account.value) {
        // Account is an object with value property
        accountId = formInput.account.value
        accountName = formInput.account.displayName || formInput.name
        accountSource = formInput.account.sourceName || formInput.source
    } else {
        // Try dictionary structure (formInput is an object with input objects)
        const formInputs = formInput as FormDefinitionInputV2025 | undefined
        const accountInput = Object.values(formInputs ?? {}).find(
            (x) => x && x.id === 'account' && (x.value?.length ?? 0) > 0
        )
        if (accountInput?.value) {
            accountId = accountInput.value
            const nameInput = Object.values(formInputs ?? {}).find((x) => x && x.id === 'name')
            accountName = nameInput?.value || nameInput?.description
            const sourceInput = Object.values(formInputs ?? {}).find((x) => x && x.id === 'source')
            accountSource = sourceInput?.value || sourceInput?.description
        }
    }

    if (!accountId) {
        return null
    }

    return {
        id: accountId,
        name: accountName || accountId,
        sourceName: accountSource || '',
    }
}

/**
 * Extract candidate identity IDs from form input.
 * Supports both flat and dictionary input structures.
 */
export const extractCandidateIdsFromFormInput = (formInput: any): string[] => {
    if (!formInput || typeof formInput !== 'object') return []

    let candidatesStr: string | undefined
    if (typeof formInput.candidates === 'string') {
        candidatesStr = formInput.candidates
    } else {
        const formInputs = formInput as Record<string, any>
        const candidatesInput = Object.values(formInputs).find(
            (x: any) => x?.id === 'candidates' && (x.value || x.description)
        )
        candidatesStr = candidatesInput?.value || candidatesInput?.description
    }

    if (typeof candidatesStr !== 'string' || candidatesStr.length === 0) {
        return []
    }

    return candidatesStr
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
}

/**
 * Create fusion decision from completed form instance
 * accountInfoOverride allows overriding account info from managedAccountsById before it's deleted
 * Returns null if decision cannot be created
 */
export const createFusionDecision = async (
    formInstance: FormInstanceResponseV2025,
    identities?: IdentityService,
    accountInfoOverride?: { id: string; name: string; sourceName: string; sourceId?: string; nativeIdentity?: string }
): Promise<FusionDecision | null> => {
    assert(formInstance, 'Form instance is required')
    assert(formInstance.id, 'Form instance ID is required')

    const finished =
        formInstance.state === 'COMPLETED' ||
        formInstance.state === 'IN_PROGRESS' ||
        formInstance.state === 'SUBMITTED'

    const { formData, formInput, recipients } = formInstance

    if (!formInput || !recipients || recipients.length === 0) {
        return null
    }

    // Use accountInfoOverride if provided (from managedAccountsById), otherwise extract from formInput
    let accountInfo = accountInfoOverride || extractAccountInfoFromFormInput(formInput)
    if (!accountInfo) {
        return null
    }

    const sourceType = extractSourceType(formInput)

    const isNewIdentity = formData?.newIdentity ?? true
    // SELECT elements with dataSource return arrays, extract the first element
    const identitiesValue = formData?.identities
    const existingIdentity = isNewIdentity
        ? undefined
        : Array.isArray(identitiesValue)
          ? identitiesValue[0]
          : identitiesValue

    if (!isNewIdentity && !existingIdentity) {
        logger.error(
            `[formProcessor] Form ${formInstance.id}: toggle is false but no identity selected ` +
                `for account ${accountInfo.name} [${accountInfo.sourceName}]. Skipping decision.`
        )
        return null
    }

    const reviewerIdentityId = recipients[0].id
    if (!reviewerIdentityId) {
        return null
    }

    const reviewer = getReviewerInfo(reviewerIdentityId, identities)
    if (!reviewer) {
        return null
    }

    // Best-effort: hydrate reviewer displayName/email for history + reporting.
    // getReviewerInfo is sync and only consults the local cache; for out-of-scope identities
    // we try to fetch on-demand here (createFusionDecision is async).
    if (identities && (!reviewer.name || reviewer.name === reviewerIdentityId || !reviewer.email)) {
        try {
            const fetched = await identities.fetchIdentityById(reviewerIdentityId)
            const displayName =
                fetched?.displayName || (fetched as any)?.attributes?.displayName || fetched?.name || reviewer.name
            const email = (fetched as any)?.attributes?.email || reviewer.email
            if (displayName) reviewer.name = displayName
            if (email) reviewer.email = email
        } catch {
            // ignore: keep existing reviewer info
        }
    }

    // Persist correlated identity reference (if the form stored it) for downstream reporting/history.
    // Supports both flat and dictionary formInput structures.
    const correlatedIdentityId =
        (typeof (formInput as any)?.identityId === 'string' && (formInput as any).identityId.length > 0
            ? String((formInput as any).identityId)
            : undefined) ||
        (() => {
            try {
                const dict = formInput as Record<string, any>
                const inputObj = Object.values(dict ?? {}).find((x: any) => x?.id === 'identityId' && (x.value || x.description))
                const value = inputObj?.value || inputObj?.description
                return typeof value === 'string' && value.length > 0 ? value : undefined
            } catch {
                return undefined
            }
        })()

    // Prefer correlated identity display name for downstream reporting/history.
    // This is especially important for "new identity" decisions where there's no selected match,
    // but the fusion account may already be attached to an identity.
    if (correlatedIdentityId && identities) {
        let correlated = identities.getIdentityById(correlatedIdentityId)
        if (!correlated) {
            try {
                correlated = await identities.fetchIdentityById(correlatedIdentityId)
            } catch {
                correlated = undefined
            }
        }
        const correlatedName = correlated?.displayName || correlated?.attributes?.displayName || correlated?.name
        if (correlatedName) {
            accountInfo = { ...accountInfo, name: correlatedName }
        }
    }

    let selectedIdentity = existingIdentity ? identities?.getIdentityById(existingIdentity) : undefined
    if (existingIdentity && identities && !selectedIdentity) {
        try {
            selectedIdentity = await identities.fetchIdentityById(existingIdentity)
        } catch {
            selectedIdentity = undefined
        }
    }
    const selectedIdentityName = existingIdentity
        ? selectedIdentity?.displayName ||
          (selectedIdentity as any)?.attributes?.displayName ||
          selectedIdentity?.name ||
          existingIdentity
        : undefined

    const normalizeScalar = (value: unknown): string => {
        if (value === null || value === undefined) return ''
        if (typeof value === 'string') return value
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
        if (typeof value === 'object') {
            const anyVal: any = value as any
            const maybeValue = anyVal?.value
            if (typeof maybeValue === 'string') return maybeValue
            const maybeDisplay = anyVal?.displayName ?? anyVal?.name ?? anyVal?.id
            if (typeof maybeDisplay === 'string') return maybeDisplay
        }
        return String(value)
    }

    // Defensive: ensure decision.account fields are strings so templates never render "[object Object]".
    const sourceIdNorm = normalizeScalar((accountInfo as any)?.sourceId)
    const nativeIdNorm = normalizeScalar((accountInfo as any)?.nativeIdentity)
    accountInfo = {
        id: normalizeScalar((accountInfo as any)?.id),
        name: normalizeScalar((accountInfo as any)?.name) || normalizeScalar((accountInfo as any)?.id),
        sourceName: normalizeScalar((accountInfo as any)?.sourceName),
        ...(sourceIdNorm ? { sourceId: sourceIdNorm } : {}),
        ...(nativeIdNorm ? { nativeIdentity: nativeIdNorm } : {}),
    }

    return {
        submitter: reviewer,
        account: accountInfo,
        newIdentity: isNewIdentity,
        correlatedIdentityId,
        identityId: existingIdentity,
        identityName: selectedIdentityName,
        comments: formData?.comments || '',
        finished,
        formUrl: formInstance.standAloneFormUrl ?? undefined,
        sourceType,
    }
}

const extractSourceType = (formInput: any): SourceType => {
    if (typeof formInput?.sourceType === 'string') {
        const value = formInput.sourceType as string
        if (value === 'authoritative' || value === 'record' || value === 'orphan') return value
    }
    return 'authoritative'
}
