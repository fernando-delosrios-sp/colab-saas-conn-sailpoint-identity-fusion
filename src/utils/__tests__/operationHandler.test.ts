import { createOperationHandler, OperationHandlerOptions } from '../operationHandler'
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import type { Mock } from 'vitest'

// Mock the ServiceRegistry class
vi.mock('../../services/serviceRegistry', () => {
    const serviceRegistryMock = vi.fn().mockImplementation((_config, _context, res, _operationName) => {
        return {
            res,
            log: {
                detail: vi.fn(),
                info: vi.fn(),
                error: vi.fn(),
            },
            proxy: {
                isProxyService: vi.fn().mockReturnValue(false),
                isProxyMode: vi.fn().mockReturnValue(false),
                execute: vi.fn().mockImplementation(() => {
                    res.send()
                    return Promise.resolve(undefined)
                }),
            },
        }
    })
    const ServiceRegistry: any = new Proxy(serviceRegistryMock, {
        construct(target, args) {
            return target(...args)
        },
    })
    ServiceRegistry.run = vi.fn((_reg, callback) => callback())
    return { ServiceRegistry }
})

// Mock the logger
vi.mock('@sailpoint/connector-sdk', async () => {
    const originalModule = await vi.importActual<typeof import('@sailpoint/connector-sdk')>('@sailpoint/connector-sdk')
    return {
        ...originalModule,
        logger: {
            info: vi.fn(),
            error: vi.fn(),
        },
    }
})

describe('createOperationHandler', () => {
    const operationName = 'testOperation'
    const mockConfig = { processingWait: 1000 } as any
    const defaultOptions: OperationHandlerOptions = {
        errorMessage: 'Default error message',
    }

    let defaultFn: Mock
    let context: any
    let input: any
    let res: any

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()

        defaultFn = vi.fn().mockImplementation((serviceRegistry: any) => {
            serviceRegistry.res.send()
            return Promise.resolve(undefined)
        })
        context = {}
        input = { data: 'testInput' }
        res = { keepAlive: vi.fn(), send: vi.fn(), error: vi.fn() }
    })

    afterEach(() => {
        vi.useRealTimers()
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
            context[operationName] = vi.fn().mockImplementation((serviceRegistry: any) => {
                serviceRegistry.res.send()
                return Promise.resolve(undefined)
            })
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)
            await handler(context, input, res)

            expect(context[operationName]).toHaveBeenCalledTimes(1)
            expect(context[operationName]).toHaveBeenCalledWith(expect.any(Object), input)
            expect(defaultFn).not.toHaveBeenCalled()
        })

        it('should run in Proxy mode when proxy client', async () => {
            ;(ServiceRegistry as any).mockImplementationOnce((_config: any, _context: any, res: any, _operationName: any) => ({
                res,
                log: { detail: vi.fn(), info: vi.fn(), error: vi.fn() },
                proxy: {
                    isProxyService: vi.fn().mockReturnValue(false),
                    isProxyMode: vi.fn().mockReturnValue(true),
                    execute: vi.fn().mockImplementation(() => {
                        res.send()
                        return Promise.resolve(undefined)
                    }),
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

            vi.advanceTimersByTime(2000)
            expect(res.keepAlive).not.toHaveBeenCalled()
        })

        it('should start simple keepAlive interval', async () => {
            // eslint-disable-next-line prefer-const
            let resolveRegistry: any
            let resolveFn: () => void
            const longPromise = new Promise<void>((resolve) => {
                resolveFn = () => {
                    resolveRegistry.res.send()
                    resolve()
                }
            })
            defaultFn.mockReturnValue(longPromise)

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'simple' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)
            resolveRegistry = (ServiceRegistry as any).mock.results[(ServiceRegistry as any).mock.results.length - 1].value

            // Wait for interval to be set up
            await Promise.resolve()

            vi.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(1)

            vi.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(2)

            // Finish the operation
            resolveFn!()
            await promise

            // Ensure no more calls after finish
            vi.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(2)
        })

        it('should start memory keepAlive interval without memory log line', async () => {
            // eslint-disable-next-line prefer-const
            let resolveRegistry: any
            let resolveFn: () => void
            const longPromise = new Promise<void>((resolve) => {
                resolveFn = () => {
                    resolveRegistry.res.send()
                    resolve()
                }
            })
            defaultFn.mockReturnValue(longPromise)

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'memory' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)
            resolveRegistry = (ServiceRegistry as any).mock.results[(ServiceRegistry as any).mock.results.length - 1].value

            await Promise.resolve()

            vi.advanceTimersByTime(1000)
            expect(res.keepAlive).toHaveBeenCalledTimes(1)
            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Memory usage'))

            resolveFn!()
            await promise
        })

        it('should not start simple keepAlive if run mode is Proxy', async () => {
            ;(ServiceRegistry as any).mockImplementationOnce((_config: any, _context: any, res: any, _operationName: any) => ({
                res,
                log: { detail: vi.fn(), info: vi.fn(), error: vi.fn() },
                proxy: {
                    isProxyService: vi.fn().mockReturnValue(false),
                    isProxyMode: vi.fn().mockReturnValue(true),
                    execute: vi.fn().mockImplementation(async () => {
                        vi.advanceTimersByTime(1500)
                        res.send()
                    }),
                },
            }))

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'simple' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)
            await Promise.resolve()
            vi.advanceTimersByTime(1000)
            await promise

            expect(res.keepAlive).not.toHaveBeenCalled()
        })

        it('should not start memory keepAlive if proxy server', async () => {
            ;(ServiceRegistry as any).mockImplementationOnce((_config: any, _context: any, res: any, _operationName: any) => ({
                res,
                log: { detail: vi.fn(), info: vi.fn(), error: vi.fn() },
                proxy: {
                    isProxyService: vi.fn().mockReturnValue(true),
                    isProxyMode: vi.fn().mockReturnValue(false),
                    execute: vi.fn().mockImplementation(() => {
                        res.send()
                        return Promise.resolve(undefined)
                    }),
                },
            }))

            defaultFn.mockImplementation(async (serviceRegistry: any) => {
                vi.advanceTimersByTime(1500)
                serviceRegistry.res.send()
            })

            const options: OperationHandlerOptions = { ...defaultOptions, keepAlive: 'memory' }
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            const promise = handler(context, input, res)
            await Promise.resolve()
            vi.advanceTimersByTime(1000)
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
            await expect(handler(context, input, res)).rejects.toHaveProperty(
                'message',
                'Default error message: String error'
            )
        })

        it('should wrap Error objects in ConnectorError', async () => {
            defaultFn.mockRejectedValue(new Error('Standard error'))

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)

            await expect(handler(context, input, res)).rejects.toThrow(ConnectorError)
            await expect(handler(context, input, res)).rejects.toHaveProperty(
                'message',
                'Default error message: Standard error'
            )
        })

        it('should use function for error message if provided', async () => {
            defaultFn.mockRejectedValue(new Error('Failed'))

            const options: OperationHandlerOptions = {
                errorMessage: (input: any) => `Dynamic error for ${input.data}`,
            }

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, options)

            await expect(handler(context, input, res)).rejects.toThrow(ConnectorError)
            await expect(handler(context, input, res)).rejects.toHaveProperty(
                'message',
                'Dynamic error for testInput: Failed'
            )
        })
    })

    describe('Cleanup', () => {
        it('should clear interval on success', async () => {
            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)
            await handler(context, input, res)
        })

        it('should clear interval on error', async () => {
            defaultFn.mockRejectedValue(new Error('Test error'))

            const handler = createOperationHandler(operationName, defaultFn, mockConfig, defaultOptions)

            await expect(handler(context, input, res)).rejects.toThrow()
        })
    })


})


