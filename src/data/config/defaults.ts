/**
 * Merged `defaults` and `connectorSpecInitialValues` built from per-setting modules
 * (same key order as `connector-spec.json` -> `sourceConfigInitialValues`).
 */
import * as advancedConnectionSettings from './settings/advancedConnectionSettings'
import * as attributeMappingDefinitionsSettings from './settings/attributeMappingDefinitionsSettings'
import * as connectionSettings from './settings/connectionSettings'
import * as developerSettings from './settings/developerSettings'
import * as matchingSettings from './settings/matchingSettings'
import * as normalAttributeDefinitionsSettings from './settings/normalAttributeDefinitionsSettings'
import * as processingControlSettings from './settings/processingControlSettings'
import * as proxySettings from './settings/proxySettings'
import * as reviewSettings from './settings/reviewSettings'
import * as scopeSettings from './settings/scopeSettings'
import * as sourcesSettings from './settings/sourcesSettings'
import * as uniqueAttributeDefinitionsSettings from './settings/uniqueAttributeDefinitionsSettings'

export const connectorSpecInitialValues = {
    ...connectionSettings.connectorSpecInitialValues,
    fusionFormExpirationDays: reviewSettings.connectorSpecInitialValues.fusionFormExpirationDays,
    fusionAverageScore: matchingSettings.connectorSpecInitialValues.fusionAverageScore,
    provisioningTimeout: advancedConnectionSettings.connectorSpecInitialValues.provisioningTimeout,
    apiMaxConcurrent: advancedConnectionSettings.connectorSpecInitialValues.apiMaxConcurrent,
    objectMaxConcurrent: advancedConnectionSettings.connectorSpecInitialValues.objectMaxConcurrent,
    fusionMaxCandidatesForForm: reviewSettings.connectorSpecInitialValues.fusionMaxCandidatesForForm,
    ...scopeSettings.connectorSpecInitialValues,
    ...processingControlSettings.connectorSpecInitialValues,
    ...attributeMappingDefinitionsSettings.connectorSpecInitialValues,
    processingWait: advancedConnectionSettings.connectorSpecInitialValues.processingWait,
    ...developerSettings.connectorSpecInitialValues,
    ...proxySettings.connectorSpecInitialValues,
    ...uniqueAttributeDefinitionsSettings.connectorSpecInitialValues,
    ...normalAttributeDefinitionsSettings.connectorSpecInitialValues,
    algorithm: matchingSettings.connectorSpecInitialValues.algorithm,
    ...sourcesSettings.connectorSpecInitialValues,
} as const

export const defaults = {
    ...connectorSpecInitialValues,
    source: sourcesSettings.runtimeDefaults.source,
    ...processingControlSettings.runtimeDefaults,
    ...matchingSettings.runtimeDefaults,
    ...developerSettings.runtimeDefaults,
} as const
