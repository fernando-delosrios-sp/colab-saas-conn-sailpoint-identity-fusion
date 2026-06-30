/**
 * connector-spec.json -> Attribute Matching Settings -> Review Settings
 */
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
    return {
        fusionFormAttributes: (raw.fusionFormAttributes as string[] | undefined) ?? [],
        fusionFormExpirationDays: (raw.fusionFormExpirationDays as number | undefined) ?? runtimeDefaults.fusionFormExpirationDays,
        fusionOwnerIsGlobalReviewer: raw.fusionOwnerIsGlobalReviewer as boolean | undefined,
        fusionReportOnAggregation: raw.fusionReportOnAggregation as boolean | undefined,
    }
}
