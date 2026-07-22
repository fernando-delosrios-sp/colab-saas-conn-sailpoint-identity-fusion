import { ServiceRegistry } from '../../../services/serviceRegistry'
import { ClientService } from '../../../services/clientService'
import { ReplayApiAdapter } from '../../../services/clientService/replayApiAdapter'
import { FusionConfig } from '../../../model/config'

export interface SourceConfigLike {
    name: string
    correlationMode?: 'none' | 'correlate' | 'reverse'
    sourceType?: 'authoritative' | 'record' | 'orphan'
    aggregationMode?: 'none' | 'before' | 'delayed'
    aggregationDelay?: number
    optimizedAggregation?: boolean
    disableNonMatchingAccounts?: boolean
    correlationAttribute?: string
    correlationDisplayName?: string
}

export interface TestRegistryOptions {
    sourceConfigs?: Array<Record<string, unknown>>
    overrides?: Record<string, any>
}

/**
 * Creates a test ServiceRegistry wired with ReplayApiAdapter as the only mocked boundary.
 * All services are real instances, constructed through the standard ServiceRegistry
 * dependency graph. Only the ISC API adapter (and optionally specific services via
 * overrides) are substituted.
 *
 * Callers that need to set pre-conditions on read-only getters (e.g. hasFusionSource,
 * managedSources) may cast the result as any — those are test-scenario setup, not
 * implementation mocking.
 */
export function createTestRegistry(options: TestRegistryOptions = {}): ServiceRegistry {
    const sourceConfigs = options.sourceConfigs ?? []
    const config = {
        sources: sourceConfigs,
        baseurl: 'https://test.example.com',
        spConnectorInstanceId: 'test-instance',
    } as unknown as FusionConfig

    const fakeAdapter = new ReplayApiAdapter([], config as any)

    const clientLog = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        setQueue: vi.fn(),
        flush: vi.fn(),
        crash: vi.fn(),
        timer: vi.fn(() => ({
            phase: vi.fn(),
            end: vi.fn(),
            totalElapsed: vi.fn(() => 0),
            getPhaseBreakdown: vi.fn(() => ({})),
        })),
        metric: vi.fn(),
        track: vi.fn(() => ({
            done: vi.fn(() => 0),
            elapsedMs: vi.fn(() => 0),
        })),
    }

    const client = new ClientService(fakeAdapter, null, config, clientLog as any)

    const context: any = {
        connectionService: client,
        ...options.overrides,
    }

    return new ServiceRegistry(config, context, { send: vi.fn() } as any, 'test')
}
