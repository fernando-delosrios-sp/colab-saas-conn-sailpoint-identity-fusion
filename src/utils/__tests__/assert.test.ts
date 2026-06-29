import { assert, softAssert } from '../assert'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { ConnectorError } from '@sailpoint/connector-sdk'

describe('assert', () => {
    const mockLog = {
        crash: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        flush: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('assert - success cases', () => {
        it('should not throw when value is truthy', () => {
            expect(() => assert('valid', 'msg')).not.toThrow()
            expect(() => assert(1, 'msg')).not.toThrow()
            expect(() => assert(true, 'msg')).not.toThrow()
        })

        it('should not throw when condition is true', () => {
            expect(() => assert(1 === 1, 'msg')).not.toThrow()
        })
    })

    describe('assert - failure cases', () => {
        it('should throw when value is null and registry has no log', async () => {
            await ServiceRegistry.run({} as any, async () => {
                expect(() => assert(null, 'expected error')).toThrow(ConnectorError)
                expect(() => assert(null, 'expected error')).toThrow(/expected error/)
            })
        })

        it('should throw when value is undefined', async () => {
            await ServiceRegistry.run({} as any, async () => {
                expect(() => assert(undefined, 'msg')).toThrow()
            })
        })

        it('should throw when condition is false', async () => {
            await ServiceRegistry.run({} as any, async () => {
                expect(() => assert(false, 'condition failed')).toThrow(/condition failed/)
            })
        })

        it('should call log.crash when registry has log', async () => {
            mockLog.crash.mockImplementation(() => {
                throw new ConnectorError('crash message', 'generic' as any)
            })
            await ServiceRegistry.run({ log: mockLog } as any, async () => {
                expect(() => assert(null, 'crash message')).toThrow(ConnectorError)
                expect(mockLog.crash).toHaveBeenCalledWith('crash message')
            })
        })
    })

    describe('softAssert', () => {
        it('should return true when value is valid', () => {
            expect(softAssert('x', 'msg')).toBe(true)
            expect(softAssert(1, 'msg')).toBe(true)
        })

        it('should return false when value is null', async () => {
            await ServiceRegistry.run({ log: mockLog } as any, async () => {
                expect(softAssert(null, 'msg')).toBe(false)
                expect(mockLog.warn).toHaveBeenCalledWith('msg')
            })
        })

        it('should use error level when specified', async () => {
            await ServiceRegistry.run({ log: mockLog } as any, async () => {
                softAssert(null, 'error msg', 'error')
                expect(mockLog.error).toHaveBeenCalledWith('error msg')
            })
        })
    })
})
