/**
 * Lightweight assertion helpers for use in modules that participate in the
 * `data/config -> settings -> assert -> serviceRegistry -> clientService ->
 * data/config` cycle. The full `utils/assert` integrates with ServiceRegistry
 * for rich crash reporting, but importing it here would re-create the cycle
 * under Vitest's stricter ESM evaluation. These helpers throw on failure and
 * do not interact with the registry — sufficient for the settings-layer
 * validation that runs before any operation starts.
 */
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { bootstrapLog } from '../../../services/logService'

export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        bootstrapLog.error(message)
        throw new ConnectorError(message, ConnectorErrorType.Generic)
    }
}

export function softAssert(condition: unknown, message: string, _level: 'warn' | 'error' = 'warn'): boolean {
    if (!condition) {
        bootstrapLog.warn(message)
        return false
    }
    return true
}

