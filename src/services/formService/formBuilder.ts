import { FormElementV2025, FormDefinitionInputV2025 } from 'sailpoint-api-client'
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { capitalizeFirst } from '../../utils/attributes'
import { trimStr } from '../../utils/safeRead'
import { ALGORITHM_LABELS } from './constants'
import { Candidate, Score } from './types'

// ============================================================================
// Local Types
// ============================================================================

type ToggleConfig = {
    label: string
    default: boolean
    trueLabel: string
    falseLabel: string
    helpText: string
}

type FormRule = {
    sourceType: 'ELEMENT'
    source: string
    operator: 'EQ' | 'NE' | 'NOT_EM'
    valueType: 'BOOLEAN' | 'STRING'
    value: string
}

type FormEffect = {
    effectType: 'DISABLE' | 'HIDE'
    config: { element: string }
}

type FormCondition = {
    ruleOperator: 'AND' | 'OR'
    rules: FormRule[]
    effects: FormEffect[]
}

// ============================================================================
// Shared Helpers
// ============================================================================

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)

const getAttrValue = (attrs: Record<string, any> | undefined, name: string): string =>
    String(attrs?.[name] ?? attrs?.[lowerFirst(name)] ?? '')

function getManagedAccountIdentifier(fusionAccount: FusionAccount): string {
    const managedKey = trimStr(fusionAccount.managedAccountId) ?? ''
    if (managedKey) {
        return managedKey
    }
    throw new ConnectorError(
        `Cannot build review form without managed account key for fusion account ${fusionAccount.name || fusionAccount.nativeIdentity}.`,
        ConnectorErrorType.Generic
    )
}

/**
 * Formats match score rows for form defaults: Value (raw) and Score (weighted partial), or combined row.
 */
function formatScoreDisplay(score: Score): string {
    if (score.skipped) return 'Skipped (missing value)'
    const algo = String(score.algorithm ?? '')
    if (algo === 'weighted-mean' || algo === 'average') {
        const s = Number(score.score)
        const t = score.fusionScore
        const scoreStr = Number.isFinite(s) ? String(parseFloat(s.toFixed(2))) : 'N/A'
        if (t !== undefined && t !== null) return `Score: ${scoreStr} [${t}]`
        return `Score: ${scoreStr}`
    }
    const raw = Number(score.score)
    const w = score.weightedScore
    const t = score.fusionScore
    const rawStr = Number.isFinite(raw) ? parseFloat(raw.toFixed(2)) : undefined
    if (rawStr !== undefined && typeof w === 'number' && Number.isFinite(w)) {
        return `Value: ${rawStr} | Score: ${parseFloat(w.toFixed(2))} [${t}]`
    }
    if (rawStr !== undefined && t !== undefined && t !== null) {
        return `Value: ${rawStr} [${t}]`
    }
    return `Value: ${rawStr ?? 'N/A'}`
}

/**
 * Returns true when candidate detail elements are expected to be rendered.
 * This keeps condition generation aligned with form field generation.
 */
function hasRenderableCandidateElements(candidate: Candidate, fusionFormAttributes?: string[]): boolean {
    const hasAttributes = (fusionFormAttributes?.length ?? 0) > 0
    const hasScores = candidate.scores.some((score) => score.attribute != null && score.score !== undefined)
    return hasAttributes || hasScores
}

/**
 * Returns the TOGGLE element config for the "New identity" / "No match" decision,
 * which varies by source type.
 */
function getToggleConfig(sourceType: SourceType): ToggleConfig {
    if (sourceType === SourceType.Authoritative) {
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
            sourceType === SourceType.Record
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
    sourceType: SourceType = SourceType.Authoritative
): Record<string, string> => {
    const managedAccountIdentifier = getManagedAccountIdentifier(fusionAccount)

    // NOTE: formInput must match the form definition input types.
    // Keep values primitive (STRING/BOOLEAN/NUMBER) to avoid Custom Forms payload issues.
    // IMPORTANT: Form values must be consistent with form conditions.
    // For identities SELECT, we use displayName as the label and id as the value.
    //
    // Priority for the human-friendly account label used in reports and decision history:
    // 1. identityDisplayName — the correlated identity's full name (most authoritative when attached)
    // 2. name / displayName — fusion row title (ISC Account.name; displayName aliases name)
    // 3. managedAccountIdentifier — managed account key when labels are unavailable
    const preferredAccountLabel =
        fusionAccount.identityDisplayName ||
        fusionAccount.name ||
        fusionAccount.displayName ||
        managedAccountIdentifier
    if (!fusionAccount.identityDisplayName && !fusionAccount.name && !fusionAccount.displayName) {
        logger.error(
            `[formBuilder] Missing identityDisplayName/name for fusion account. Using managed account key fallback: ${managedAccountIdentifier}`
        )
    }

    const formInput: Record<string, string> = {
        sourceType,
        // `name` is used downstream in reports and decision history messages; prefer human-friendly display labels.
        name: preferredAccountLabel,
        account: managedAccountIdentifier,
        source: fusionAccount.sourceName ?? '',
        // Keep as string for newIdentity to align with TOGGLE element.
        newIdentity: 'false',
        // Store candidate identity IDs for tracking candidate status on subsequent aggregations.
        // This allows extracting candidate IDs from pending form instances without parsing keys.
        candidates: candidates.map((c) => c.id).join(','),
    }

    // Persist correlated identity reference for downstream resolution (reports/history),
    // even when identity layer is not in scope at decision processing time.
    if (fusionAccount.identityId) {
        formInput.identityId = fusionAccount.identityId
    }

    // New identity attributes (flat keys for form elements)
    fusionFormAttributes?.forEach((attrName) => {
        formInput[`newidentity.${lowerFirst(attrName)}`] = getAttrValue(fusionAccount.attributes, attrName)
    })

    // Candidate attributes and scores (flat keys for form elements)
    for (const candidate of candidates) {
        if (!candidate?.id) continue
        const candidateId = candidate.id

        fusionFormAttributes?.forEach((attrName) => {
            formInput[`${candidateId}.${lowerFirst(attrName)}`] = getAttrValue(candidate.attributes, attrName)
        })

        for (const score of candidate.scores) {
            if (score.attribute && score.score !== undefined) {
                const attrKey = lowerFirst(String(score.attribute))
                const algorithmKey = String(score.algorithm ?? 'unknown')
                formInput[`${candidateId}.${attrKey}.${algorithmKey}.score`] = formatScoreDisplay(score)
            }
        }
    }

    return formInput
}

/**
 * Build form fields for fusion form definition
 */
export const buildFormFields = (
    fusionAccount: FusionAccount,
    candidates: Candidate[],
    fusionFormAttributes?: string[],
    sourceType: SourceType = SourceType.Authoritative
): FormElementV2025[] => {
    const formFields: FormElementV2025[] = []

    // Top section: Fusion review required header
    const topSectionElements: FormElementV2025[] = []
    fusionFormAttributes?.forEach((attrName) => {
        const attrKey = lowerFirst(attrName)
        topSectionElements.push({
            id: `newidentity.${attrKey}`,
            key: `newidentity.${attrKey}`,
            elementType: 'TEXT',
            config: {
                label: capitalizeFirst(attrName),
                // Prefill visible values at definition-time so instances don't render blank.
                default: getAttrValue(fusionAccount.attributes, attrName),
            },
            validations: [],
        })
    })

    if (topSectionElements.length > 0) {
        const sectionDescriptions: Record<SourceType, string> = {
            [SourceType.Authoritative]:
                'A potential matching identity has been detected. Please review the candidate identities below and either select an existing identity to link this account to, or choose to create a new identity.',
            [SourceType.Record]:
                'A potential matching record has been detected. Please review the candidate identities below and either select an existing identity to link this account to, or confirm there is no match.',
            [SourceType.Orphan]:
                'A potential match for an orphan account has been detected. Please review the candidate identities below and either select an existing identity to link this account to, or confirm there is no match.',
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
    const identitySearchQuery = candidates.map((c) => `id:${c.id}`).join(' OR ')

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
    for (const candidate of candidates) {
        if (!candidate?.id || !candidate.name) continue
        const candidateId = candidate.id
        const candidateElements: FormElementV2025[] = []

        fusionFormAttributes?.forEach((attrName) => {
            const attrKey = lowerFirst(attrName)
            candidateElements.push({
                id: `${candidateId}.${attrKey}`,
                key: `${candidateId}.${attrKey}`,
                elementType: 'TEXT',
                config: {
                    label: capitalizeFirst(attrName),
                    default: getAttrValue(candidate.attributes, attrName),
                },
                validations: [],
            })
        })

        // Add score details header and individual score display fields per check
        // Each field shows: label = "AttributeName", helpText = "Algorithm", value = "Score: X [Y]"
        if (candidate.scores.length > 0) {
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

            for (const score of candidate.scores) {
                if (!score.attribute || score.score === undefined) continue
                const attrName = String(score.attribute)
                const attrKey = lowerFirst(attrName)
                const algorithmKey = String(score.algorithm ?? 'unknown')
                const algorithm = ALGORITHM_LABELS[algorithmKey] ?? algorithmKey

                candidateElements.push({
                    id: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                    key: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                    elementType: 'TEXT',
                    config: {
                        label: capitalizeFirst(attrName),
                        helpText: algorithm,
                        default: formatScoreDisplay(score),
                    },
                    validations: [],
                })
            }
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
    }

    return formFields
}

/**
 * Build form conditions to show/hide and disable candidate sections appropriately.
 * Per candidate:
 * 1. When newIdentity is true → DISABLE that candidate's selection section.
 * 2. When newIdentity is true OR identities is not this candidate → HIDE that candidate's selection section.
 * 3. When newIdentity is false AND identities is empty → DISABLE all attribute fields (to prevent interaction before decision).
 */
export const buildFormConditions = (candidates: Candidate[], fusionFormAttributes?: string[]): FormCondition[] => {
    if (!Array.isArray(candidates)) return []

    const formConditions: FormCondition[] = []

    for (const candidate of candidates) {
        if (!candidate?.id || !candidate.name) continue
        if (!hasRenderableCandidateElements(candidate, fusionFormAttributes)) continue
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
                    config: { element: selectionSectionId },
                },
            ],
        })

        // Hide this candidate's section when new identity is selected OR a different identity is chosen.
        // In ISC custom forms, condition comparison for SEARCH_V2-backed SELECT behaves against the
        // displayed label value (`attributes.displayName`), same as `resolveIdentitiesSelectLabel` / candidate.name.
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
                    config: { element: selectionSectionId },
                },
            ],
        })
    }

    // Disable every element (except newIdentity and identities) if it is not empty.
    // Each element gets a self-referencing condition: if element X is NOT_EM → disable element X.
    const allAttributeElements: string[] = []

    // Collect new identity attribute fields
    fusionFormAttributes?.forEach((attrName) => {
        allAttributeElements.push(`newidentity.${lowerFirst(attrName)}`)
    })

    // Collect candidate attribute and score fields
    for (const candidate of candidates) {
        if (!candidate?.id || !candidate.name) continue
        if (!hasRenderableCandidateElements(candidate, fusionFormAttributes)) continue
        const candidateId = candidate.id

        fusionFormAttributes?.forEach((attrName) => {
            allAttributeElements.push(`${candidateId}.${lowerFirst(attrName)}`)
        })

        for (const score of candidate.scores) {
            if (score.attribute) {
                const attrKey = lowerFirst(String(score.attribute))
                const algorithmKey = String(score.algorithm ?? 'unknown')
                allAttributeElements.push(`${candidateId}.${attrKey}.${algorithmKey}.score`)
            }
        }
    }

    // For each element: if it has a value, disable it
    for (const elementId of allAttributeElements) {
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
                    config: { element: elementId },
                },
            ],
        })
    }

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
    const managedAccountIdentifier = getManagedAccountIdentifier(fusionAccount)

    // Account info
    // IMPORTANT: Use the same label priority as buildFormInput so form definition and instance are consistent.
    if (!fusionAccount.identityDisplayName && !fusionAccount.name && !fusionAccount.displayName) {
        logger.error(
            `[formBuilder] Missing identityDisplayName/name for fusion account in form inputs. Using managed account key fallback: ${managedAccountIdentifier}`
        )
    }

    const formInputs: FormDefinitionInputV2025[] = [
        {
            id: 'name',
            type: 'STRING',
            label: 'name',
            description:
                fusionAccount.identityDisplayName ||
                fusionAccount.name ||
                fusionAccount.displayName ||
                managedAccountIdentifier,
        },
        {
            id: 'account',
            type: 'STRING',
            label: 'account',
            description: managedAccountIdentifier,
        },
        {
            id: 'source',
            type: 'STRING',
            label: 'source',
            description: fusionAccount.sourceName,
        },
        // NOTE: SDK only supports STRING / ARRAY for definition inputs. Toggle still binds to this key.
        // SELECT elements with dataSource don't need an input definition - they populate dynamically.
        {
            id: 'newIdentity',
            type: 'STRING',
            label: 'newIdentity',
            description: 'false',
        },
        // Must match buildFormInput `candidates` so ISC persists the CSV on instances (pending candidate status on aggregations).
        {
            id: 'candidates',
            type: 'STRING',
            label: 'candidates',
            description: candidates.map((c) => c.id).join(','),
        },
    ]

    if (fusionAccount.identityId) {
        formInputs.push({
            id: 'identityId',
            type: 'STRING',
            label: 'identityId',
            description: fusionAccount.identityId,
        })
    }

    // New identity attributes
    fusionFormAttributes?.forEach((attrName) => {
        const attrKey = lowerFirst(attrName)
        formInputs.push({
            id: `newidentity.${attrKey}`,
            type: 'STRING',
            label: `newidentity.${attrKey}`,
            description: getAttrValue(fusionAccount.attributes, attrName),
        })
    })

    // Candidate attributes and scores
    for (const candidate of candidates) {
        if (!candidate?.id) continue
        const candidateId = candidate.id

        fusionFormAttributes?.forEach((attrName) => {
            const attrKey = lowerFirst(attrName)
            formInputs.push({
                id: `${candidateId}.${attrKey}`,
                type: 'STRING',
                label: `${candidateId}.${attrKey}`,
                description: getAttrValue(candidate.attributes, attrName),
            })
        })

        for (const score of candidate.scores) {
            if (!score.attribute || score.score === undefined) continue
            const attrKey = lowerFirst(String(score.attribute))
            const algorithmKey = String(score.algorithm ?? 'unknown')
            formInputs.push({
                id: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                type: 'STRING',
                label: `${candidateId}.${attrKey}.${algorithmKey}.score`,
                description: formatScoreDisplay(score),
            })
        }
    }

    return formInputs
}
