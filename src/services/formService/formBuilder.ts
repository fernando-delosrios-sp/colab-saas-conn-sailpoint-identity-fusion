import { FormElementV2025, FormDefinitionInputV2025 } from 'sailpoint-api-client'
import { logger } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { capitalizeFirst } from '../../utils/attributes'
import { ALGORITHM_LABELS } from './constants'
import { Candidate } from './types'

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Builds a best-effort identifier for a fusion account, trying several fields
 * in priority order before falling back to 'unknown'.
 */
function getAccountIdentifier(fusionAccount: FusionAccount): string {
    return (
        String(fusionAccount.managedAccountId || '').trim() ||
        String(fusionAccount.nativeIdentityOrUndefined || '').trim() ||
        String((fusionAccount.attributes as any)?.id || '').trim() ||
        String((fusionAccount.attributes as any)?.uuid || '').trim() ||
        String(fusionAccount.identityId || '').trim() ||
        'unknown'
    )
}

/**
 * Formats a score/threshold pair as "Score: X [Y]" or "Score: X".
 */
function formatScoreDisplay(scoreValue: number, thresholdValue?: number | null): string {
    const trimmedScore = Number.isFinite(scoreValue) ? parseFloat(scoreValue.toFixed(2)) : undefined
    const scoreStr = trimmedScore !== undefined ? String(trimmedScore) : 'N/A'
    if (thresholdValue !== undefined && thresholdValue !== null) {
        return `Score: ${scoreStr} [${thresholdValue}]`
    }
    return `Score: ${scoreStr}`
}

/**
 * Returns true when candidate detail elements are expected to be rendered.
 * This keeps condition generation aligned with form field generation.
 */
function hasRenderableCandidateElements(candidate: Candidate, fusionFormAttributes?: string[]): boolean {
    const hasAttributes = Boolean(fusionFormAttributes && fusionFormAttributes.length > 0)
    const hasScores = Boolean(
        candidate.scores &&
        Array.isArray(candidate.scores) &&
        candidate.scores.some((score: any) => score && score.attribute && score.score !== undefined)
    )
    return hasAttributes || hasScores
}

/**
 * Returns the TOGGLE element config for the "New identity" / "No match" decision,
 * which varies by source type.
 */
function getToggleConfig(sourceType: SourceType): Record<string, any> {
    if (sourceType === 'authoritative') {
        return {
            label: 'New identity',
            default: false,
            trueLabel: 'True',
            falseLabel: 'False',
            helpText: 'Select this if the account is a new identity',
        }
    }
    return {
        label: 'No match',
        default: false,
        trueLabel: 'True',
        falseLabel: 'False',
        helpText:
            sourceType === 'record'
                ? 'Select this if the record does not match any existing identity'
                : 'Select this if the orphan account does not match any existing identity',
    }
}

// ============================================================================
// Form Building Functions
// ============================================================================

/**
 * Build form input data structure
 */
export const buildFormInput = (
    fusionAccount: FusionAccount,
    candidates: Candidate[],
    fusionFormAttributes?: string[],
    sourceType: SourceType = 'authoritative'
): Record<string, any> => {
    const formInput: Record<string, any> = {}
    formInput.sourceType = sourceType

    const accountIdentifier = getAccountIdentifier(fusionAccount)

    // NOTE: formInput must match the form definition input types.
    // Keep values primitive (STRING/BOOLEAN/NUMBER) to avoid Custom Forms payload issues.
    // IMPORTANT: Form values must be consistent with form conditions.
    // For identities SELECT, we use displayName as the label and id as the value.
    if (!fusionAccount.displayName) {
        logger.error(`[formBuilder] Missing displayName for fusion account. Using fallback value: ${accountIdentifier}`)
    }
    formInput.name = fusionAccount.displayName || fusionAccount.name || accountIdentifier
    formInput.account = accountIdentifier
    formInput.source = fusionAccount.sourceName
    // Defaults for interactive decision fields
    // Keep as string for newIdentity to align with TOGGLE element.
    formInput.newIdentity = 'false'

    // New identity attributes (flat keys for form elements)
    if (fusionFormAttributes && fusionFormAttributes.length > 0) {
        fusionFormAttributes.forEach((attrName) => {
            const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
            const attrValue = fusionAccount.attributes?.[attrName] || fusionAccount.attributes?.[attrKey] || ''
            formInput[`newidentity.${attrKey}`] = String(attrValue)
        })
    }

    // Store candidate identity IDs for tracking candidate status on subsequent aggregations.
    // This allows extracting candidate IDs from pending form instances without parsing keys.
    formInput.candidates = candidates.map((c) => c.id).join(',')

    // Candidate attributes and scores (flat keys for form elements)
    candidates.forEach((candidate) => {
        if (!candidate || !candidate.id) return
        const candidateId = candidate.id

        if (fusionFormAttributes && fusionFormAttributes.length > 0) {
            fusionFormAttributes.forEach((attrName) => {
                const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
                const attrValue = candidate.attributes?.[attrName] || candidate.attributes?.[attrKey] || ''
                formInput[`${candidateId}.${attrKey}`] = String(attrValue)
            })
        }

        if (candidate.scores && Array.isArray(candidate.scores) && candidate.scores.length > 0) {
            candidate.scores.forEach((score: any) => {
                if (!score || typeof score !== 'object') return
                if (score.attribute && score.score !== undefined) {
                    const attrKey = String(score.attribute).charAt(0).toLowerCase() + String(score.attribute).slice(1)
                    const algorithmKey = String(score.algorithm ?? 'unknown')
                    formInput[`${candidateId}.${attrKey}.${algorithmKey}.score`] = formatScoreDisplay(
                        Number(score.score),
                        score.fusionScore
                    )
                }
            })
        }
    })

    return formInput
}

/**
 * Build form fields for fusion form definition
 */
export const buildFormFields = (
    fusionAccount: FusionAccount,
    candidates: Candidate[],
    fusionFormAttributes?: string[],
    sourceType: SourceType = 'authoritative'
): FormElementV2025[] => {
    const formFields: FormElementV2025[] = []

    // Top section: Fusion review required header
    const topSectionElements: FormElementV2025[] = []
    if (fusionFormAttributes && fusionFormAttributes.length > 0) {
        fusionFormAttributes.forEach((attrName) => {
            const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
            const attrValue = fusionAccount.attributes?.[attrName] ?? fusionAccount.attributes?.[attrKey] ?? ''
            topSectionElements.push({
                id: `newidentity.${attrKey}`,
                key: `newidentity.${attrKey}`,
                elementType: 'TEXT',
                config: {
                    label: capitalizeFirst(attrName),
                    // Prefill visible values at definition-time so instances don't render blank.
                    default: String(attrValue),
                },
                validations: [],
            })
        })
    }

    if (topSectionElements.length > 0) {
        const sectionDescriptions: Record<SourceType, string> = {
            authoritative:
                'A potential duplicate identity has been detected. Please review the candidate identities below and either select an existing identity to link this account to, or choose to create a new identity.',
            record: 'A potential matching record has been detected. Please review the candidate identities below and either select an existing identity to link this account to, or confirm there is no match.',
            orphan: 'A potential match for an orphan account has been detected. Please review the candidate identities below and either select an existing identity to link this account to, or confirm there is no match.',
        }

        formFields.push({
            id: 'topSection',
            key: 'topSection',
            elementType: 'SECTION',
            config: {
                alignment: 'CENTER',
                description: sectionDescriptions[sourceType],
                formElements: topSectionElements,
                label: `Fusion review required for ${fusionAccount.sourceName}`,
                labelStyle: 'h2',
                showLabel: true,
            },
            validations: [],
        })
    }

    // Build search query for identities: id:xxx OR id:yyy OR id:zzz
    const identityIds = candidates.map((candidate) => candidate.id)
    const identitySearchQuery = identityIds.map((id) => `id:${id}`).join(' OR ')

    // Fusion decision section: New identity toggle and identities select in a COLUMN_SET
    formFields.push({
        id: 'identitiesSection',
        key: 'identitiesSection',
        elementType: 'SECTION',
        config: {
            alignment: 'CENTER',
            formElements: [
                {
                    id: 'decisionsColumnSet',
                    key: 'decisionsColumnSet',
                    elementType: 'COLUMN_SET',
                    config: {
                        alignment: 'CENTER',
                        columnCount: 2,
                        columns: [
                            [
                                {
                                    id: 'newIdentity',
                                    key: 'newIdentity',
                                    elementType: 'TOGGLE',
                                    config: getToggleConfig(sourceType),
                                    validations: [],
                                },
                            ],
                            [
                                {
                                    id: 'identities',
                                    key: 'identities',
                                    elementType: 'SELECT',
                                    config: {
                                        dataSource: {
                                            config: {
                                                indices: ['identities'],
                                                query: identitySearchQuery,
                                                label: 'attributes.displayName',
                                                sublabel: 'attributes.email',
                                                value: 'id',
                                            },
                                            dataSourceType: 'SEARCH_V2',
                                        },
                                        forceSelect: true,
                                        label: 'Existing identity',
                                        maximum: 1,
                                        required: false,
                                        helpText: 'Select the identity the account is part of',
                                        placeholder: null,
                                    },
                                    validations: [],
                                },
                            ],
                        ],
                        description: '',
                        label: 'Decisions',
                        labelStyle: 'h5',
                        showLabel: false,
                    },
                    validations: [],
                },
            ],
            label: 'Fusion decision',
            labelStyle: 'h3',
            showLabel: true,
        },
        validations: [],
    })

    // Candidate sections: one per candidate
    candidates.forEach((candidate) => {
        if (!candidate || !candidate.id || !candidate.name) return
        const candidateId = candidate.id

        // Validate that candidate has displayName for form conditions
        if (!candidate.name) {
            logger.error(
                `[formBuilder] Candidate ${candidateId} is missing name/displayName. This may cause form condition issues.`
            )
        }

        const candidateElements: FormElementV2025[] = []

        if (fusionFormAttributes && fusionFormAttributes.length > 0) {
            fusionFormAttributes.forEach((attrName) => {
                const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
                const attrValue = candidate.attributes?.[attrName] ?? candidate.attributes?.[attrKey] ?? ''
                candidateElements.push({
                    id: `${candidateId}.${attrKey}`,
                    key: `${candidateId}.${attrKey}`,
                    elementType: 'TEXT',
                    config: {
                        label: capitalizeFirst(attrName),
                        default: String(attrValue),
                    },
                    validations: [],
                })
            })
        }

        // Add score details header and individual score display fields per check
        // Each field shows: label = "AttributeName", helpText = "Algorithm", value = "Score: X [Y]"
        if (candidate.scores && Array.isArray(candidate.scores) && candidate.scores.length > 0) {
            candidateElements.push({
                id: `${candidateId}.scoreDetailsHeader`,
                key: `${candidateId}.scoreDetailsHeader`,
                elementType: 'DESCRIPTION',
                config: {
                    description:
                        '<p style="text-align: center;"><span style="font-size: 18pt;"><strong>Fusion Score details</strong></span></p>',
                    label: 'Fusion Score Details',
                    showLabel: false,
                },
                validations: [],
            })

            candidate.scores.forEach((score: any) => {
                if (!score || typeof score !== 'object') return
                if (score.attribute && score.score !== undefined) {
                    const attrName = String(score.attribute)
                    const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
                    const algorithmKey = String(score.algorithm ?? 'unknown')
                    const algorithm = ALGORITHM_LABELS[algorithmKey] ?? algorithmKey

                    candidateElements.push({
                        id: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                        key: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                        elementType: 'TEXT',
                        config: {
                            label: capitalizeFirst(attrName),
                            helpText: algorithm,
                            default: formatScoreDisplay(Number(score.score), score.fusionScore),
                        },
                        validations: [],
                    })
                }
            })
        }

        if (candidateElements.length > 0) {
            formFields.push({
                id: `${candidateId}.selectionsection`,
                key: `${candidateId}.selectionsection`,
                elementType: 'SECTION',
                config: {
                    alignment: 'CENTER',
                    formElements: candidateElements,
                    label: `${candidate.name} details`,
                    labelStyle: 'h4',
                    showLabel: true,
                },
                validations: [],
            })
        }
    })

    return formFields
}

/**
 * Build form conditions to show/hide and disable candidate sections appropriately.
 * Per candidate:
 * 1. When newIdentity is true → DISABLE that candidate's selection section.
 * 2. When newIdentity is true OR identities is not this candidate → HIDE that candidate's selection section.
 * 3. When newIdentity is false AND identities is empty → DISABLE all attribute fields (to prevent interaction before decision).
 */
export const buildFormConditions = (candidates: Candidate[], fusionFormAttributes?: string[]): any[] => {
    const formConditions: any[] = []

    // Validate inputs to prevent malformed conditions
    if (!candidates || !Array.isArray(candidates)) {
        return formConditions
    }

    candidates.forEach((candidate) => {
        if (!candidate || !candidate.id || !candidate.name) return
        if (!hasRenderableCandidateElements(candidate, fusionFormAttributes)) return
        const selectionSectionId = `${candidate.id}.selectionsection`

        // When "New identity" is selected, disable this candidate's details section
        formConditions.push({
            ruleOperator: 'AND',
            rules: [
                {
                    sourceType: 'ELEMENT',
                    source: 'newIdentity',
                    operator: 'EQ',
                    valueType: 'BOOLEAN',
                    value: 'true',
                },
            ],
            effects: [
                {
                    effectType: 'DISABLE',
                    config: {
                        element: selectionSectionId,
                    },
                },
            ],
        })

        // Hide this candidate's section when new identity is selected OR a different identity is chosen.
        // In ISC custom forms, condition comparison for SEARCH_V2-backed SELECT behaves against the
        // displayed label value, so compare against candidate displayName.
        formConditions.push({
            ruleOperator: 'OR',
            rules: [
                {
                    sourceType: 'ELEMENT',
                    source: 'newIdentity',
                    operator: 'EQ',
                    valueType: 'BOOLEAN',
                    value: 'true',
                },
                {
                    sourceType: 'ELEMENT',
                    source: 'identities',
                    operator: 'NE',
                    valueType: 'STRING',
                    value: candidate.name,
                },
            ],
            effects: [
                {
                    effectType: 'HIDE',
                    config: {
                        element: selectionSectionId,
                    },
                },
            ],
        })
    })

    // Disable every element (except newIdentity and identities) if it is not empty.
    // Each element gets a self-referencing condition: if element X is NOT_EM → disable element X.
    const allAttributeElements: string[] = []

    // Collect new identity attribute fields
    if (fusionFormAttributes && fusionFormAttributes.length > 0) {
        fusionFormAttributes.forEach((attrName) => {
            const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
            allAttributeElements.push(`newidentity.${attrKey}`)
        })
    }

    // Collect candidate attribute and score fields
    candidates.forEach((candidate) => {
        if (!candidate || !candidate.id || !candidate.name) return
        if (!hasRenderableCandidateElements(candidate, fusionFormAttributes)) return
        const candidateId = candidate.id

        if (fusionFormAttributes && fusionFormAttributes.length > 0) {
            fusionFormAttributes.forEach((attrName) => {
                const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
                allAttributeElements.push(`${candidateId}.${attrKey}`)
            })
        }

        // Score fields
        if (candidate.scores && Array.isArray(candidate.scores)) {
            candidate.scores.forEach((score: any) => {
                if (score && score.attribute) {
                    const attrKey = String(score.attribute).charAt(0).toLowerCase() + String(score.attribute).slice(1)
                    const algorithmKey = String(score.algorithm ?? 'unknown')
                    allAttributeElements.push(`${candidateId}.${attrKey}.${algorithmKey}.score`)
                }
            })
        }
    })

    // For each element: if it has a value, disable it
    allAttributeElements.forEach((elementId) => {
        formConditions.push({
            ruleOperator: 'AND',
            rules: [
                {
                    sourceType: 'ELEMENT',
                    source: elementId,
                    operator: 'NOT_EM',
                    valueType: 'STRING',
                    value: '',
                },
            ],
            effects: [
                {
                    effectType: 'DISABLE',
                    config: {
                        element: elementId,
                    },
                },
            ],
        })
    })

    return formConditions
}

/**
 * Build form inputs for fusion form definition
 */
export const buildFormInputs = (
    fusionAccount: FusionAccount,
    candidates: Candidate[],
    fusionFormAttributes?: string[]
): FormDefinitionInputV2025[] => {
    const formInputs: FormDefinitionInputV2025[] = []

    const accountIdentifier = getAccountIdentifier(fusionAccount)

    // Account info
    // IMPORTANT: Use displayName consistently with form conditions
    if (!fusionAccount.displayName) {
        logger.error(
            `[formBuilder] Missing displayName for fusion account in form inputs. Using fallback value: ${accountIdentifier}`
        )
    }
    formInputs.push({
        id: 'name',
        type: 'STRING',
        label: 'name',
        description: fusionAccount.displayName || fusionAccount.name || accountIdentifier,
    })
    formInputs.push({
        id: 'account',
        type: 'STRING',
        label: 'account',
        description: accountIdentifier,
    })
    formInputs.push({
        id: 'source',
        type: 'STRING',
        label: 'source',
        description: fusionAccount.sourceName,
    })

    // Decision inputs (bound to interactive elements)
    // NOTE: SDK only supports STRING / ARRAY for definition inputs. Toggle still binds to this key.
    // SELECT elements with dataSource don't need an input definition - they populate dynamically.
    formInputs.push({
        id: 'newIdentity',
        type: 'STRING',
        label: 'newIdentity',
        description: 'false',
    })

    // New identity attributes
    if (fusionFormAttributes && fusionFormAttributes.length > 0) {
        fusionFormAttributes.forEach((attrName) => {
            const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
            const attrValue = fusionAccount.attributes?.[attrName] || fusionAccount.attributes?.[attrKey] || ''
            formInputs.push({
                id: `newidentity.${attrKey}`,
                type: 'STRING',
                label: `newidentity.${attrKey}`,
                description: String(attrValue),
            })
        })
    }

    // Candidate attributes and scores
    candidates.forEach((candidate) => {
        if (!candidate || !candidate.id) return
        const candidateId = candidate.id

        if (fusionFormAttributes && fusionFormAttributes.length > 0) {
            fusionFormAttributes.forEach((attrName) => {
                const attrKey = attrName.charAt(0).toLowerCase() + attrName.slice(1)
                const attrValue = candidate.attributes?.[attrName] || candidate.attributes?.[attrKey] || ''
                formInputs.push({
                    id: `${candidateId}.${attrKey}`,
                    type: 'STRING',
                    label: `${candidateId}.${attrKey}`,
                    description: String(attrValue),
                })
            })
        }

        if (candidate.scores && Array.isArray(candidate.scores) && candidate.scores.length > 0) {
            candidate.scores.forEach((score: any) => {
                if (!score || typeof score !== 'object') return
                if (score.attribute && score.score !== undefined) {
                    const attrKey = String(score.attribute).charAt(0).toLowerCase() + String(score.attribute).slice(1)
                    const algorithmKey = String(score.algorithm ?? 'unknown')

                    formInputs.push({
                        id: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                        type: 'STRING',
                        label: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                        description: formatScoreDisplay(Number(score.score), score.fusionScore),
                    })
                }
            })
        }
    })

    return formInputs
}
