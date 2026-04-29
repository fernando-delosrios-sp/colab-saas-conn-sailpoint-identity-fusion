import { readConfig, logger } from '@sailpoint/connector-sdk'
import type { FusionConfig } from '../../model/config'
import { assert } from '../../utils/assert'
import { getInternalConfigFlat } from './internal'
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
import type { FusionConfigBuild } from './types'

const settingsPipeline = [
    sourcesSettings.applySettings,
    processingControlSettings.applySettings,
    scopeSettings.applySettings,
    attributeMappingDefinitionsSettings.applySettings,
    normalAttributeDefinitionsSettings.applySettings,
    uniqueAttributeDefinitionsSettings.applySettings,
    matchingSettings.applySettings,
    reviewSettings.applySettings,
    developerSettings.applySettings,
    advancedConnectionSettings.applySettings,
    proxySettings.applySettings,
] as const

/**
 * Normalizes platform `readConfig()` into `FusionConfig`: merges flattened internal constants
 * (`getInternalConfigFlat()`, from per-service `internalConfig`), then applies per-settings modules.
 */
export const safeReadConfig = async (): Promise<FusionConfig> => {
    logger.debug('Reading connector configuration')
    const sourceConfig = await readConfig()
    assert(sourceConfig, 'Failed to read source configuration')

    const config = {
        ...sourceConfig,
        ...getInternalConfigFlat(),
    } as FusionConfigBuild

    connectionSettings.applySettings(config)

    logger.debug('Configuration loaded, applying defaults')

    for (const applySettings of settingsPipeline) {
        applySettings(config)
    }

    return config as FusionConfig
}
