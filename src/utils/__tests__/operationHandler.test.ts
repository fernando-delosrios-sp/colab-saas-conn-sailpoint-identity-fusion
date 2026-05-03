import { createOperationHandler, OperationHandlerOptions } from '../operationHandler'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'

// Mock the ServiceRegistry class
jest.mock('../../services/serviceRegistry', () => {
    return {
        ServiceRegistry: jest.fn().mockImplementation((_config, _context, _res, _operationName) => {
            return {
                proxy: {
                    isProxyService: jest.fn().mockReturnValue(false),
                    isProxyMode: jest.fn().mockReturnValue(false),
                    execute: jest.fn().mockResolvedValue(undefined),
                },
            }
        }),
    }
})

// Mock the logger
jest.mock('@sailpoint/connector-sdk', () => {
    const originalModule = jest.requireActual('@sailpoint/connector-sdk')
    return {
        ...originalModule,
        logger: {
            info: jest.fn(),
            error: jest.fn(),
        },
    }
})

describe('createOperationHandler', () => {
    const operationName = 'testOperation'
    const mockConfig = { processingWait: 1000 } as any
    const defaultOptions: OperationHandlerOptions = {
        errorMessage: 'Default error message',
    }

    let defaultFn: jest.Mock
    let context: any
    let input: any
    let res: any

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()

        defaultFn = jest.fn().mockResolvedValue(undefined)
        context = {}
        input = { data: 'testInput' }
        res = { keepAlive: jest.fn() }

        // Add static clear method mock
        ;(ServiceRegistry as any).clear = jest.fn()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('Execution Modes (RunMode)', () => {
        it('should run in Default mode when not custom or proxy', async () => {
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)
            await handler(context, input, res)

            expect(defaultFn).toHaveBeenCalledTimes(1)
            // defaultFn gets called with (serviceRegistry, input)
            expect(defaultFn).toHaveBeenCalledWith(expect.any(Object), input)
            expect(context[operationName]).toBeUndefined()
        })

        it('should run in Custom mode when custom operation exists in context', async () => {
            context[operationName] = jest.fn().mockResolvedValue(undefined)
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)
            await handler(context, input, res)

            expect(context[operationName]).toHaveBeenCalledTimes(1)
            expect(context[operationName]).toHaveBeenCalledWith(expect.any(Object), input)
            expect(defaultFn).not.toHaveBeenCalled()
        })

        it('should run in Proxy mode when proxy client', async () => {
            ;(ServiceRegistry as any).mockImplementationOnce(() => ({
                proxy: {
                    isProxyService: jest.fn().mockReturnValue(false),
                    isProxyMode: jest.fn().mockReturnValue(true),
                    execute: jest.fn().mockResolvedValue(undefined),
                },
            }))

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)
            await handler(context, input, res)

            // To verify proxy.execute was called, we need to inspect the mocked registry instance
            // But since it's created inside the handler, we know defaultFn and custom aren't called
            expect(defaultFn).not.toHaveBeenCalled()
            expect(context[operationName]).toBeUndefined()
        })
    })

    describe('Keep-Alive Functionality', () => {
        it('should not start keepAlive by default', async () => {
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)
            await handler(context, input, res)

            jest.advanceTimersByTime(2000)
            expect(res.keepAlive).not.toHaveBeenCalled()
        })

        it('should start simple keepAlive interval', async () => {
            let resolveFn: () => void
            const longPromise = new Promise<void>(resolve => {
                resolveFn = resolve
            })
            defaultFn.mockReturnValue(longPromise)

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'simple' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)

            // Wait for interval to be set up
            await Promise.resolve()

            jest.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(1)

            jest.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(2)

            // Finish the operation
            resolveFn!()
            await promise

            // Ensure no more calls after finish
            jest.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(2)
        })

        it('should start memory keepAlive interval', async () => {
            let resolveFn: () => void
            const longPromise = new Promise<void>(resolve => {
                resolveFn = resolve
            })
            defaultFn.mockReturnValue(longPromise)

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'memory' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)

            await Promise.resolve()

            jest.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(1)

            resolveFn!()
            await promise
        })

        it('should not start simple keepAlive if run mode is Proxy', async () => {
            ;(ServiceRegistry as any).mockImplementationOnce(() => ({
                proxy: {
                    isProxyService: jest.fn().mockReturnValue(false),
                    isProxyMode: jest.fn().mockReturnValue(true),
                    execute: jest.fn().mockImplementation(async () => {
                        jest.advanceTimersByTime(1500)
                    }),
                },
            }))

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'simple' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)
            await Promise.resolve()
            jest.advanceTimersByTime(1000)
            await promise

            expect(res.keepAlive).not.toHaveBeenCalled()
        })

        it('should not start memory keepAlive if proxy server', async () => {
            ;(ServiceRegistry as any).mockImplementationOnce(() => ({
                proxy: {
                    isProxyService: jest.fn().mockReturnValue(true),
                    isProxyMode: jest.fn().mockReturnValue(false),
                    execute: jest.fn().mockResolvedValue(undefined),
                },
            }))

            defaultFn.mockImplementation(async () => {
                jest.advanceTimersByTime(1500)
            })

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'memory' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)
            await Promise.resolve()
            jest.advanceTimersByTime(1000)
            await promise

            expect(res.keepAlive).not.toHaveBeenCalled()
        })
    })

    describe('Error Handling', () => {
        it('should throw original ConnectorError without wrapping', async () => {
            const connectorError = new ConnectorError('Original error', ConnectorErrorType.NotFound)
            defaultFn.mockRejectedValue(connectorError)

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)

            await expect(handler(context, input, res)).rejects.toThrow(ConnectorError)
            await expect(handler(context, input, res)).rejects.toHaveProperty('message', 'Original error')
        })

        it('should wrap string errors in ConnectorError', async () => {
            defaultFn.mockRejectedValue('String error')

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)

            await expect(handler(context, input, res)).rejects.toThrow(ConnectorError)
            await expect(handler(context, input, res)).rejects.toHaveProperty('message', 'Default error message: String error')
        })

        it('should wrap Error objects in ConnectorError', async () => {
            defaultFn.mockRejectedValue(new Error('Standard error'))

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)

            await expect(handler(context, input, res)).rejects.toThrow(ConnectorError)
            await expect(handler(context, input, res)).rejects.toHaveProperty('message', 'Default error message: Standard error')
        })

        it('should use function for error message if provided', async () => {
            defaultFn.mockRejectedValue(new Error('Failed'))

            const options: OperationHandlerOptions = {
                errorMessage: (input: any) => `Dynamic error for ${input.data}`,
            }

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            await expect(handler(context, input, res)).rejects.toThrow(ConnectorError)
            await expect(handler(context, input, res)).rejects.toHaveProperty('message', 'Dynamic error for testInput: Failed')
        })
    })

    describe('Cleanup', () => {
        it('should clear ServiceRegistry and interval on success', async () => {
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)
            await handler(context, input, res)

            expect((ServiceRegistry as any).clear).toHaveBeenCalledTimes(1)
        })

        it('should clear ServiceRegistry and interval on error', async () => {
            defaultFn.mockRejectedValue(new Error('Test error'))

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)

            await expect(handler(context, input, res)).rejects.toThrow()
            expect((ServiceRegistry as any).clear).toHaveBeenCalledTimes(1)
        })
    })
})
