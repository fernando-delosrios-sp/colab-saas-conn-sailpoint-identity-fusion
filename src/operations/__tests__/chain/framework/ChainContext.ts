import { ChainState } from './ChainState'
import type { ReplayApiAdapter } from '../../../../services/clientService/replayApiAdapter'
import type { Mock } from 'vitest'

export interface MockRegistry {
    config: Record<string, unknown>
    log: {
        info: Mock
        debug: Mock
        warn: Mock
        error: Mock
        crash: Mock
        timer: Mock
        flush: Mock
    }
    res: {
        send: Mock
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
    config?: Record<string, unknown>
    options: {
        sweep: number
        stepId: string
    }
    scenario?: any
    /** Shared api-log replay adapter for the chain (one instance, sequential consumption). */
    replayAdapter?: ReplayApiAdapter
}

