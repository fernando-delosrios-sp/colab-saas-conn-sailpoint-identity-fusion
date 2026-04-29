import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'

/**
 * Wraps an async operation with standardized ConnectorError handling.
 * Re-throws existing ConnectorErrors as-is; wraps all other errors
 * with the provided context message.
 */
export async function wrapConnectorError<T>(fn: () => Promise<T>, message: string): Promise<T> {
    try {
        return await fn()
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        const detail = error instanceof Error ? error.message : String(error)
        throw new ConnectorError(`${message}: ${detail}`, ConnectorErrorType.Generic)
    }
}
