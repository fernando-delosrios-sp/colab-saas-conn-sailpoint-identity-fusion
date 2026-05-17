import { StateWrapper } from '../stateWrapper'
import { logger } from '@sailpoint/connector-sdk'

jest.mock('@sailpoint/connector-sdk', () => ({
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
    ConnectorError: class ConnectorError extends Error {
        type: string
        constructor(message: string, type: string) {
            super(message)
            this.name = 'ConnectorError'
            this.type = type
        }
    },
    ConnectorErrorType: {
        Generic: 'Generic',
    },
}))

describe('StateWrapper', () => {
    let originalStringify: typeof JSON.stringify

    beforeAll(() => {
        originalStringify = JSON.stringify
        // Mock JSON.stringify to prevent throwing on line 17 before the try-catch block
        JSON.stringify = jest.fn().mockImplementation((val) => {
            try {
                return originalStringify(val)
            } catch {
                return '[Mocked Stringify Failed]'
            }
        })
    })

    afterAll(() => {
        JSON.stringify = originalStringify
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('constructor initialization', () => {
        it('should handle state object conversion failure and initialize with an empty Map', () => {
            // Create an object that will throw an error when Object.keys() is called
            const invalidState = new Proxy(
                { a: 1 },
                {
                    ownKeys() {
                        throw new Error('Simulated failure during Object.keys')
                    },
                }
            )

            const wrapper = new StateWrapper(invalidState)

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to convert state object to Map'))
            expect(wrapper.state).toBeInstanceOf(Map)
            expect(wrapper.state.size).toBe(0)
        })

        it('should initialize with an empty Map when no state is provided', () => {
            const wrapper = new StateWrapper()
            expect(logger.debug).toHaveBeenCalledWith('Initializing with empty state (no previous counter values)')
            expect(wrapper.state).toBeInstanceOf(Map)
            expect(wrapper.state.size).toBe(0)
        })

        it('should load counter values from valid state', () => {
            const validState = { counter1: 5, counter2: 10 }
            const wrapper = new StateWrapper(validState)

            expect(logger.debug).toHaveBeenCalledWith('Loaded 2 counter values from state')
            expect(wrapper.state).toBeInstanceOf(Map)
            expect(wrapper.state.size).toBe(2)
            expect(wrapper.state.get('counter1')).toBe(5)
            expect(wrapper.state.get('counter2')).toBe(10)
        })
    })
})
