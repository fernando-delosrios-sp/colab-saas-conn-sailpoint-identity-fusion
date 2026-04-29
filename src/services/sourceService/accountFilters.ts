import { Account } from 'sailpoint-api-client'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import jmespath from 'jmespath'
import { SourceInfo } from './types'

export type CompiledAccountJmespathFilter = {
    expression: string
    filterAccountPage: (accounts: Account[]) => Account[]
}

const buildSyntaxError = (sourceName: string, expression: string, error: unknown): ConnectorError => {
    const details = error instanceof Error ? error.message : String(error)
    return new ConnectorError(
        `Invalid Accounts JMESPath filter for source "${sourceName}": ${details}. Expression: ${expression}`,
        ConnectorErrorType.Generic
    )
}

/**
 * Compiles a source-specific Accounts JMESPath expression into a reusable in-memory
 * account-page filter. This is applied after account pages are fetched from ISC.
 */
export const compileAccountPageJmespathFilter = (
    sourceName: string,
    expression?: string
): CompiledAccountJmespathFilter | undefined => {
    if (!expression || expression.trim().length === 0) {
        return undefined
    }

    // Parse/validate expression eagerly so failures happen before account pagination starts.
    try {
        void jmespath.search({ accounts: [] }, expression)
    } catch (error) {
        throw buildSyntaxError(sourceName, expression, error)
    }

    return {
        expression,
        filterAccountPage: (accounts: Account[]): Account[] => {
            let result: unknown
            try {
                result = jmespath.search({ accounts }, expression)
            } catch (error) {
                throw buildSyntaxError(sourceName, expression, error)
            }

            if (result == null) {
                return []
            }

            if (!Array.isArray(result)) {
                throw new ConnectorError(
                    `Accounts JMESPath filter for source "${sourceName}" must return an array. Expression: ${expression}`,
                    ConnectorErrorType.Generic
                )
            }

            if (result.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))) {
                throw new ConnectorError(
                    `Accounts JMESPath filter for source "${sourceName}" must return an array of account objects. Expression: ${expression}`,
                    ConnectorErrorType.Generic
                )
            }

            return result as Account[]
        },
    }
}

/**
 * Builds the ISC Accounts API query filter for a source.
 * Includes the required sourceId clause, optional extra ISC filter clauses, and
 * managed-source accountFilter config when available.
 */
export function buildIscAccountsQueryFilter(sourceInfo: SourceInfo, ...extraFilters: string[]): string {
    const filterParts: string[] = [`sourceId eq "${sourceInfo.id}"`, ...extraFilters]
    if (sourceInfo.isManaged && sourceInfo.config?.accountFilter) {
        filterParts.push(`(${sourceInfo.config.accountFilter})`)
    }
    return filterParts.join(' and ')
}
