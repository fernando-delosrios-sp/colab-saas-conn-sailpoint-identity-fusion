import { ChainState } from './ChainState'

export interface MockRegistry {
    config: Record<string, unknown>
    log: {
        info: jest.Mock
        debug: jest.Mock
        warn: jest.Mock
        error: jest.Mock
        crash: jest.Mock
        timer: jest.Mock
        flush: jest.Mock
    }
    res: {
        send: jest.Mock
    }
    schemas: Record<string, unknown>
    sources: Record<string, unknown>
    identities: Record<string, unknown>
    forms: Record<string, unknown>
    fusion: Record<string, unknown>
    entitlements: Record<string, unknown>
    attributes: Record<string, unknown>
    messaging: Record<string, unknown>
    [key: string]: unknown
}

export interface ChainContext {
    registry: MockRegistry
    state: ChainState
    options: {
        pass: number
        stepId: string
    }
}
