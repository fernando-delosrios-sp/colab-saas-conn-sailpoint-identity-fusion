import { ClientService } from '../clientService'
import { IscApiAdapter } from '../iscApiAdapter'
import { ApiQueue } from '../queue'
import { FusionConfig } from '../../../model/config'
import { LogService } from '../../logService'
import { QueuePriority } from '../types'

describe('ClientService', () => {
    let mockAdapter: jest.Mocked<IscApiAdapter>
    let mockQueue: jest.Mocked<ApiQueue>
    let mockLog: jest.Mocked<LogService>
    let mockConfig: FusionConfig

    let activeClients: ClientService[] = []

    beforeEach(() => {
        activeClients = []
        mockAdapter = {
            config: {} as any,
            accountsApi: {} as any,
            identitiesApi: {} as any,
            searchApi: {} as any,
            sourcesApi: {} as any,
            customFormsApi: {} as any,
            workflowsApi: {} as any,
            entitlementsApi: {} as any,
            transformsApi: {} as any,
            governanceGroupsApi: {} as any,
            taskManagementApi: {} as any,
            identityProfilesApi: {} as any,
            identityAttributesApi: {} as any,
        }

        mockQueue = {
            enqueue: jest.fn(),
            getStats: jest.fn().mockReturnValue({
                queueLength: 0,
                activeRequests: 0,
                totalProcessed: 0,
                totalFailed: 0,
                totalRetries: 0,
                averageWaitTime: 0,
                averageProcessingTime: 0,
            }),
            getPendingItems: jest.fn(),
            getActiveItems: jest.fn(),
            clear: jest.fn(),
            stop: jest.fn(),
        } as unknown as jest.Mocked<ApiQueue>

        mockLog = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        } as unknown as jest.Mocked<LogService>

        mockConfig = {
            enableQueue: true,
            requestsPerSecond: 10,
            pageSize: 250,
            sailPointListMax: 250,
            statsLoggingIntervalMs: 60000,
        } as unknown as FusionConfig
    })

    afterEach(() => {
        activeClients.forEach((client) => client.dispose())
    })

    it('delegates API getters to adapter', () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)
        
        expect(client.accountsApi).toBe(mockAdapter.accountsApi)
        expect(client.identitiesApi).toBe(mockAdapter.identitiesApi)
        expect(client.config).toBe(mockAdapter.config)
    })

    it('executes directly when queue is null', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)
        const apiFunction = jest.fn().mockResolvedValue('success')
        
        const result = await client.execute(apiFunction, QueuePriority.MEDIUM)
        
        expect(apiFunction).toHaveBeenCalled()
        expect(result).toBe('success')
        expect(mockQueue.enqueue).not.toHaveBeenCalled()
    })

    it('routes through queue when queue is provided', async () => {
        mockQueue.enqueue.mockResolvedValue('queued-success')
        const client = new ClientService(mockAdapter, mockQueue, mockConfig, mockLog)
        activeClients.push(client)
        const apiFunction = jest.fn()
        
        const result = await client.execute(apiFunction, QueuePriority.HIGH)
        
        expect(mockQueue.enqueue).toHaveBeenCalled()
        expect(result).toBe('queued-success')
    })

    it('returns undefined on failure when throwOnError is false', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)
        const apiFunction = jest.fn().mockRejectedValue(new Error('api-error'))
        
        const result = await client.execute(apiFunction, QueuePriority.MEDIUM, 'test-context', undefined, false)
        
        expect(result).toBeUndefined()
        expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('api-error'))
    })

    it('throws on failure when throwOnError is true', async () => {
        const client = new ClientService(mockAdapter, null, mockConfig, mockLog)
        activeClients.push(client)
        const error = new Error('api-error')
        const apiFunction = jest.fn().mockRejectedValue(error)
        
        await expect(client.execute(apiFunction, QueuePriority.MEDIUM, 'test-context', undefined, true)).rejects.toThrow(error)
    })

    it('clears stats interval and stops queue on dispose', () => {
        const client = new ClientService(mockAdapter, mockQueue, mockConfig, mockLog)
        activeClients.push(client)
        client.dispose()
        expect(mockQueue.stop).toHaveBeenCalled()
    })
})
