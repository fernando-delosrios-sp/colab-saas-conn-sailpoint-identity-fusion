/**
 * connector-spec.json -> Attribute Matching Settings -> Review Settings
 */
import { assert } from './assertLite'
import { internalConfig } from '../internal'
import type { ReviewSettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    fusionFormExpirationDays: 7,
    fusionMaxCandidatesForForm: 3,
} as const

export const runtimeDefaults = {
    fusionFormExpirationDays: connectorSpecInitialValues.fusionFormExpirationDays,
    fusionMaxCandidatesForForm: connectorSpecInitialValues.fusionMaxCandidatesForForm,
} as const

export function defaultFusionMaxCandidatesForForm(): number {
    return connectorSpecInitialValues.fusionMaxCandidatesForForm
}

export function readSettings(raw: Record<string, unknown>): ReviewSettingsSection {
    const rawMaxCandidates =
        raw.fusionMaxCandidatesForForm !== undefined
            ? Number(raw.fusionMaxCandidatesForForm)
            : runtimeDefaults.fusionMaxCandidatesForForm
    assert(
        Number.isFinite(rawMaxCandidates) &&
            rawMaxCandidates >= internalConfig.formService.fusionMaxCandidatesForFormMin &&
            rawMaxCandidates <= internalConfig.formService.fusionMaxCandidatesForFormMax,
        `fusionMaxCandidatesForForm must be between ${internalConfig.formService.fusionMaxCandidatesForFormMin} and ${internalConfig.formService.fusionMaxCandidatesForFormMax}`
    )

    return {
        fusionFormAttributes: (raw.fusionFormAttributes as string[] | undefined) ?? [],
        fusionFormExpirationDays: (raw.fusionFormExpirationDays as number | undefined) ?? runtimeDefaults.fusionFormExpirationDays,
        fusionMaxCandidatesForForm: Math.trunc(rawMaxCandidates),
        fusionOwnerIsGlobalReviewer: raw.fusionOwnerIsGlobalReviewer as boolean | undefined,
        fusionReportOnAggregation: raw.fusionReportOnAggregation as boolean | undefined,
    }
}
