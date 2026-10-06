import { createOperationHandler } from '../operationHandler'

const mockProxy = {
    isProxyService: jest.fn(),
    isProxyMode: jest.fn(),
    execute: jest.fn(),
}

jest.mock('../../services/serviceRegistry', () => ({
    ServiceRegistry: Object.assign(
        jest.fn().mockImplementation(() => ({
            proxy: mockProxy,
        })),
        { clear: jest.fn() }
    ),
}))

describe('createOperationHandler keep-alive', () => {
    const defaultFn = jest.fn().mockResolvedValue(undefined)

    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
        defaultFn.mockResolvedValue(undefined)
        mockProxy.execute.mockResolvedValue(undefined)
        mockProxy.isProxyService.mockReturnValue(false)
        mockProxy.isProxyMode.mockReturnValue(false)
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    const run = (keepAlive: 'simple' | 'memory' | undefined, context: Record<string, unknown> = {}) => {
        const res = { keepAlive: jest.fn() }
        const handler = createOperationHandler('accountUpdate', defaultFn, { processingWait: 1_000 } as any, {
            errorMessage: 'Failed to update account',
            keepAlive,
        })
        return handler(context, {}, res).then(() => res.keepAlive)
    }

    it('skips simple keep-alive when running as a proxy client', async () => {
        mockProxy.isProxyMode.mockReturnValue(true)

        const keepAlive = await run('simple')

        expect(mockProxy.execute).toHaveBeenCalled()
        expect(keepAlive).not.toHaveBeenCalled()
        jest.advanceTimersByTime(5_000)
        expect(keepAlive).not.toHaveBeenCalled()
    })

    it('sends simple keep-alive in default mode', async () => {
        const keepAlive = await run('simple')

        expect(defaultFn).toHaveBeenCalled()
        expect(keepAlive).toHaveBeenCalled()
    })

    it('sends simple keep-alive for a custom operation even when proxy mode is enabled', async () => {
        mockProxy.isProxyMode.mockReturnValue(true)
        const custom = jest.fn().mockResolvedValue(undefined)

        const keepAlive = await run('simple', { accountUpdate: custom })

        expect(custom).toHaveBeenCalled()
        expect(mockProxy.execute).not.toHaveBeenCalled()
        expect(keepAlive).toHaveBeenCalled()
    })

    it('still sends memory keep-alive when running as a proxy client', async () => {
        mockProxy.isProxyMode.mockReturnValue(true)

        const keepAlive = await run('memory')

        expect(mockProxy.execute).toHaveBeenCalled()
        expect(keepAlive).toHaveBeenCalled()
    })
})
