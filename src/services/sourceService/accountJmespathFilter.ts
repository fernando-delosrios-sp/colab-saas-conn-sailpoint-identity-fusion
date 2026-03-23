import { Account } from 'sailpoint-api-client'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import jmespath from 'jmespath'

export type CompiledAccountJmespathFilter = {
    expression: string
    filterPage: (accounts: Account[]) => Account[]
}

const buildSyntaxError = (sourceName: string, expression: string, error: unknown): ConnectorError => {
    const details = error instanceof Error ? error.message : String(error)
    return new ConnectorError(
        `Invalid Accounts JMESPath filter for source "${sourceName}": ${details}. Expression: ${expression}`,
        ConnectorErrorType.Generic
    )
}

export const compileAccountJmespathFilter = (
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
        filterPage: (accounts: Account[]): Account[] => {
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
