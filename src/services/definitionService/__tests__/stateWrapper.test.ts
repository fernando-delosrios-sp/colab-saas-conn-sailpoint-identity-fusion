import { StateWrapper } from '../stateWrapper'
import { bootstrapLog } from '../../logService/bootstrapLog'

vi.mock('../../logService/bootstrapLog', () => ({
    bootstrapLog: {
        detail: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
}))

vi.mock('../../serviceRegistry', () => ({
    ServiceRegistry: {
        getCurrent: vi.fn(() => {
            throw new Error('No active operation')
        }),
    },
}))

vi.mock('@sailpoint/connector-sdk', () => ({
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
        JSON.stringify = vi.fn().mockImplementation((val) => {
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
        vi.clearAllMocks()
    })

    describe('constructor initialization', () => {
        it('should handle state object conversion failure and initialize with an empty Map', () => {
            const invalidState = new Proxy(
                { a: 1 },
                {
                    ownKeys() {
                        throw new Error('Simulated failure during Object.keys')
                    },
                }
            )

            const wrapper = new StateWrapper(invalidState)

            expect(bootstrapLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to convert state object to Map'))
            expect((wrapper as any).state).toBeInstanceOf(Map)
            expect((wrapper as any).state.size).toBe(0)
        })

        it('should initialize with an empty Map when no state is provided', () => {
            const wrapper = new StateWrapper()
            expect(bootstrapLog.debug).toHaveBeenCalledWith('Initializing with empty state (no previous counter values)')
            expect((wrapper as any).state).toBeInstanceOf(Map)
            expect((wrapper as any).state.size).toBe(0)
        })

        it('should load counter values from valid state', () => {
            const validState = { counter1: 5, counter2: 10 }
            const wrapper = new StateWrapper(validState)

            expect(bootstrapLog.debug).toHaveBeenCalledWith('Loaded 2 counter values from state')
            expect((wrapper as any).state).toBeInstanceOf(Map)
            expect((wrapper as any).state.size).toBe(2)
            expect((wrapper as any).state.get('counter1')).toBe(5)
            expect((wrapper as any).state.get('counter2')).toBe(10)
        })
    })
})
