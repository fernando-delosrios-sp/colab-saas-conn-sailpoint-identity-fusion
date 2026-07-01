/**
 * Per-setting modules export two aggregates:
 * - `connectorSpecInitialValues`: UI-exposed defaults, mirrors
 *   `connector-spec.json` -> `sourceConfigInitialValues` (same key order).
 * - `runtimeDefaults`: universal execution fallback, extends the UI defaults with
 *   non-UI config bridged from `internalConfig` (e.g. time units converted to ms).
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
    fusionManualReviewScore: matchingSettings.connectorSpecInitialValues.fusionManualReviewScore,
    provisioningTimeout: advancedConnectionSettings.connectorSpecInitialValues.provisioningTimeout,
    fusionMaxCandidatesForForm: reviewSettings.connectorSpecInitialValues.fusionMaxCandidatesForForm,
    ...scopeSettings.connectorSpecInitialValues,
    ...processingControlSettings.connectorSpecInitialValues,
    ...attributeMappingDefinitionsSettings.connectorSpecInitialValues,
    maxRetries: advancedConnectionSettings.connectorSpecInitialValues.maxRetries,
    requestsPerSecond: advancedConnectionSettings.connectorSpecInitialValues.requestsPerSecond,
    maxConcurrentRequests: advancedConnectionSettings.connectorSpecInitialValues.maxConcurrentRequests,
    processingWait: advancedConnectionSettings.connectorSpecInitialValues.processingWait,
    ...developerSettings.connectorSpecInitialValues,
    ...proxySettings.connectorSpecInitialValues,
    ...uniqueAttributeDefinitionsSettings.connectorSpecInitialValues,
    ...normalAttributeDefinitionsSettings.connectorSpecInitialValues,
    algorithm: matchingSettings.connectorSpecInitialValues.algorithm,
    enablePriority: matchingSettings.connectorSpecInitialValues.enablePriority,
    ...sourcesSettings.connectorSpecInitialValues,
} as const

export const runtimeDefaults = {
    ...connectorSpecInitialValues,
    source: sourcesSettings.runtimeDefaults.source,
    ...processingControlSettings.runtimeDefaults,
    ...matchingSettings.runtimeDefaults,
    ...developerSettings.runtimeDefaults,
    ...advancedConnectionSettings.runtimeDefaults,
    ...scopeSettings.runtimeDefaults,
    ...proxySettings.runtimeDefaults,
    ...reviewSettings.runtimeDefaults,
    ...attributeMappingDefinitionsSettings.runtimeDefaults,
    ...uniqueAttributeDefinitionsSettings.runtimeDefaults,
} as const
