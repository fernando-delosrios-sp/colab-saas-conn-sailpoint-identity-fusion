import { FormElementV2025, FormDefinitionInputV2025 } from 'sailpoint-api-client'
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { FusionAttribute } from '../../data/schema'
import { UrlContext } from '../../utils/url'
import { trimStr } from '../../utils/safeRead'
import { translate, translateWithParams } from '../emailService/localization'
import { Candidate } from './types'
import {
    FORM_HTML_ACCOUNT_INPUT,
    FORM_HTML_CANDIDATES_INPUT,
    formInputInterpolation,
    renderCandidatesDisplayHtml,
    renderFusionAccountHtml,
} from './formHtml'

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

function getManagedAccountIdentifier(fusionAccount: FusionAccount): string {
    const managedKey = trimStr(fusionAccount.managedAccountId) ?? ''
    if (managedKey) {
        return managedKey
    }
    throw new ConnectorError(
        `Cannot build review form without managed account key for fusion account ${fusionAccount.name || fusionAccount.managedKey}.`,
        ConnectorErrorType.Generic
    )
}

/**
 * Returns the TOGGLE element config for the "New identity" / "No match" decision,
 * which varies by source type.
 */
function getToggleConfig(sourceType: SourceType, locale = 'en'): ToggleConfig {
    if (sourceType === SourceType.Authoritative) {
        return {
            label: translate('form_toggle_new_identity', locale),
            default: false,
            trueLabel: translate('form_toggle_true', locale),
            falseLabel: translate('form_toggle_false', locale),
            helpText: translate('form_toggle_help_new_identity', locale),
        }
    }
    return {
        label: translate('form_toggle_no_match', locale),
        default: false,
        trueLabel: translate('form_toggle_true', locale),
        falseLabel: translate('form_toggle_false', locale),
        helpText:
            sourceType === SourceType.Record
                ? translate('form_toggle_help_no_match_record', locale)
                : translate('form_toggle_help_no_match_orphan', locale),
    }
}

function preferredAccountLabel(fusionAccount: FusionAccount, managedAccountIdentifier: string): string {
    return (
        fusionAccount.identityDisplayName || fusionAccount.name || fusionAccount.displayName || managedAccountIdentifier
    )
}

function warnMissingAccountLabel(
    fusionAccount: FusionAccount,
    managedAccountIdentifier: string,
    context: string
): void {
    if (!fusionAccount.identityDisplayName && !fusionAccount.name && !fusionAccount.displayName) {
        logger.error(
            `[formBuilder] Missing identityDisplayName/name for fusion account${context}. Using managed account key fallback: ${managedAccountIdentifier}`
        )
    }
}

function descriptionElement(id: string, interpolationKey: string): FormElementV2025 {
    return {
        id,
        key: id,
        elementType: 'DESCRIPTION',
        config: {
            description: formInputInterpolation(interpolationKey),
            showLabel: false,
        },
        validations: [],
    }
}

/**
 * Build form input data structure
 */
export const buildFormInput = (
    fusionAccount: FusionAccount,
    candidates: Candidate[],
    fusionFormAttributes?: string[],
    sourceType: SourceType = SourceType.Authoritative,
    locale = 'en',
    urlContext?: UrlContext
): Record<string, string> => {
    const managedAccountIdentifier = getManagedAccountIdentifier(fusionAccount)

    warnMissingAccountLabel(fusionAccount, managedAccountIdentifier, '')

    const formInput: Record<string, string> = {
        sourceType,
        name: preferredAccountLabel(fusionAccount, managedAccountIdentifier),
        account: managedAccountIdentifier,
        source: fusionAccount.sourceName ?? '',
        newIdentity: 'false',
        candidates: candidates.map((c) => c.id).join(','),
        [FORM_HTML_ACCOUNT_INPUT]: renderFusionAccountHtml(
            fusionAccount,
            fusionFormAttributes,
            locale,
            urlContext,
            sourceType
        ),
        [FORM_HTML_CANDIDATES_INPUT]: renderCandidatesDisplayHtml(candidates, locale, urlContext),
    }

    if (fusionAccount.identityId) {
        formInput.identityId = fusionAccount.identityId
    }

    return formInput
}

/**
 * Build form fields for fusion form definition
 */
export const buildFormFields = (
    fusionAccount: FusionAccount,
    candidates: Candidate[],
    _fusionFormAttributes?: string[],
    sourceType: SourceType = SourceType.Authoritative,
    locale = 'en'
): FormElementV2025[] => {
    const identitySearchQuery = candidates.map((c) => `id:${c.id}`).join(' OR ')

    return [
        {
            id: 'displaySection',
            key: 'displaySection',
            elementType: 'SECTION',
            config: {
                alignment: 'CENTER',
                formElements: [
                    descriptionElement('accountDisplay', FORM_HTML_ACCOUNT_INPUT),
                    descriptionElement('candidatesDisplay', FORM_HTML_CANDIDATES_INPUT),
                ],
                label: translateWithParams('form_review_required_header', locale, {
                    sourceName: fusionAccount.sourceName ?? '',
                }),
                labelStyle: 'h2',
                showLabel: false,
            },
            validations: [],
        },
        {
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
                                        config: getToggleConfig(sourceType, locale),
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
                                            label: translate('form_existing_identity', locale),
                                            maximum: 1,
                                            required: false,
                                            helpText: translate('form_existing_identity_help', locale),
                                            placeholder: null,
                                        },
                                        validations: [],
                                    },
                                ],
                            ],
                            description: '',
                            label: translate('form_decisions', locale),
                            labelStyle: 'h5',
                            showLabel: false,
                        },
                        validations: [],
                    },
                ],
                label: translate('form_fusion_decision', locale),
                labelStyle: 'h3',
                showLabel: true,
            },
            validations: [],
        },
    ]
}

/**
 * Review form conditions. Display is DESCRIPTION HTML, so per-candidate HIDE and
 * TEXT disable-when-not-empty rules are not used.
 */
export const buildFormConditions = (_candidates?: Candidate[], _fusionFormAttributes?: string[]): FormCondition[] => {
    return []
}

/**
 * Build form inputs for fusion form definition
 */
export const buildFormInputs = (
    fusionAccount: FusionAccount,
    candidates: Candidate[],
    fusionFormAttributes?: string[],
    locale = 'en',
    urlContext?: UrlContext,
    sourceType?: SourceType
): FormDefinitionInputV2025[] => {
    const managedAccountIdentifier = getManagedAccountIdentifier(fusionAccount)
    warnMissingAccountLabel(fusionAccount, managedAccountIdentifier, ' in form inputs')

    const formInputs: FormDefinitionInputV2025[] = [
        {
            id: 'name',
            type: 'STRING',
            label: 'name',
            description: preferredAccountLabel(fusionAccount, managedAccountIdentifier),
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
        {
            id: 'newIdentity',
            type: 'STRING',
            label: 'newIdentity',
            description: 'false',
        },
        {
            id: 'candidates',
            type: 'STRING',
            label: 'candidates',
            description: candidates.map((c) => c.id).join(','),
        },
        {
            id: FORM_HTML_ACCOUNT_INPUT,
            type: 'STRING',
            label: FORM_HTML_ACCOUNT_INPUT,
            description: renderFusionAccountHtml(fusionAccount, fusionFormAttributes, locale, urlContext, sourceType),
        },
        {
            id: FORM_HTML_CANDIDATES_INPUT,
            type: 'STRING',
            label: FORM_HTML_CANDIDATES_INPUT,
            description: renderCandidatesDisplayHtml(candidates, locale, urlContext),
        },
    ]

    if (fusionAccount.identityId) {
        formInputs.push({
            id: FusionAttribute.IdentityId,
            type: 'STRING',
            label: FusionAttribute.IdentityId,
            description: fusionAccount.identityId,
        })
    }

    return formInputs
}
