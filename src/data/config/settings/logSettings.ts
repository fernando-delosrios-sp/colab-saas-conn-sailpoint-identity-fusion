/**
 * connector-spec.json -> Advanced Settings -> Log Settings
 *
 * Controls the minimum severity written to the ISC host log. Level order is
 * `debug < info < warn < error`; messages below the selection are skipped
 * before they are built.
 */
import type { LogSettingsSection } from '../../../model/config'

export const connectorSpecInitialValues = {
    logLevel: 'info' as const,
}

export const runtimeDefaults = {
    logLevel: connectorSpecInitialValues.logLevel,
} as const

/** Allowed Log level values (Error, Warn, Info, Debug). */
const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const

/**
 * Reads the Log level from raw connector config.
 *
 * Unknown or missing values fall back to `info` without throwing.
 */
export function readSettings(raw: Record<string, unknown>): LogSettingsSection {
    const logLevel = LOG_LEVELS.find((level) => level === raw.logLevel) ?? runtimeDefaults.logLevel
    return { logLevel }
}
