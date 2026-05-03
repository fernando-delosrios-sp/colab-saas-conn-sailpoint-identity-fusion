import { wrapConnectorError } from '../error'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'

describe('wrapConnectorError', () => {
    it('should return the result of a successful promise', async () => {
        const result = await wrapConnectorError(async () => 'success', 'test message')
        expect(result).toBe('success')
    })

    it('should re-throw an existing ConnectorError as-is', async () => {
        const existingError = new ConnectorError('original error', ConnectorErrorType.NotFound)

        await expect(
            wrapConnectorError(async () => {
                throw existingError
            }, 'wrapper message')
        ).rejects.toThrow(existingError)
    })

    it('should wrap a standard Error with a ConnectorError containing the context message', async () => {
        const standardError = new Error('standard error message')

        await expect(
            wrapConnectorError(async () => {
                throw standardError
            }, 'Context message')
        ).rejects.toMatchObject({
            message: 'Context message: standard error message',
            type: ConnectorErrorType.Generic,
        })
    })

    it('should wrap a non-Error string exception with a ConnectorError', async () => {
        await expect(
            wrapConnectorError(async () => {
                throw 'string error'
            }, 'Context message')
        ).rejects.toMatchObject({
            message: 'Context message: string error',
            type: ConnectorErrorType.Generic,
        })
    })

    it('should wrap a non-Error object exception with a ConnectorError', async () => {
        await expect(
            wrapConnectorError(async () => {
                throw { foo: 'bar' }
            }, 'Context message')
        ).rejects.toMatchObject({
            message: 'Context message: [object Object]',
            type: ConnectorErrorType.Generic,
        })
    })
})
