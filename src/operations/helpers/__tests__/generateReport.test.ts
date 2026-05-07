import { ServiceRegistry } from '../../../services/serviceRegistry'
import { fetchAndProcessForReport, generateReport } from '../generateReport'
import * as corePipeline from '../corePipeline'
import { FusionAccount } from '../../../model/account'
import { AggregationStats } from '../../../services/fusionService/types'

jest.mock('../corePipeline', () => ({
    setupPhase: jest.fn(),
    fetchPhase: jest.fn(),
    refreshPhase: jest.fn(),
    processPhase: jest.fn(),
    uniqueAttributesPhase: jest.fn(),
}))

describe('generateReport helpers', () => {
    let mockServiceRegistry: Partial<ServiceRegistry>
    let mockTimer: any
    let mockReportsService: any

    beforeEach(() => {
        jest.clearAllMocks()

        mockTimer = {
            phase: jest.fn(),
            totalElapsed: jest.fn().mockReturnValue(1234),
            getPhaseBreakdown: jest.fn().mockReturnValue({ phase1: 100, phase2: 200 }),
        }

        mockReportsService = {
            generateAndSendFusionReport: jest.fn().mockResolvedValue(undefined),
        }

        mockServiceRegistry = {
            log: {
                timer: jest.fn().mockReturnValue(mockTimer),
            } as any,
            reports: mockReportsService,
        }

        jest.spyOn(ServiceRegistry, 'getCurrent').mockReturnValue(mockServiceRegistry as ServiceRegistry)
    })
    describe('fetchAndProcessForReport', () => {
        it('should return empty stats if setupPhase returns false', async () => {
            ;(corePipeline.setupPhase as jest.Mock).mockResolvedValue(false)

            const result = await fetchAndProcessForReport(mockServiceRegistry as ServiceRegistry)

            expect(corePipeline.setupPhase).toHaveBeenCalledWith(
                mockServiceRegistry,
                undefined,
                { mode: { kind: 'dry-run' } }
            )
            expect(result).toEqual({
                identitiesFound: 0,
                managedAccountsFound: 0,
                totalProcessingTime: 1234,
            })
            expect(corePipeline.fetchPhase).not.toHaveBeenCalled()
            expect(corePipeline.refreshPhase).not.toHaveBeenCalled()
            expect(corePipeline.processPhase).not.toHaveBeenCalled()
            expect(corePipeline.uniqueAttributesPhase).not.toHaveBeenCalled()
        })
        it('should execute all phases and return stats if setupPhase returns true', async () => {
            ;(corePipeline.setupPhase as jest.Mock).mockResolvedValue(true)

            const mockFetchResult = {
                identitiesFound: 10,
                managedAccountsFound: 20,
                managedAccountsFoundAuthoritative: 5,
                managedAccountsFoundRecord: 15,
                managedAccountsFoundOrphan: 2,
            }
            ;(corePipeline.fetchPhase as jest.Mock).mockResolvedValue(mockFetchResult)

            const result = await fetchAndProcessForReport(mockServiceRegistry as ServiceRegistry)

            const expectedOptions = { mode: { kind: 'dry-run' } }
            expect(corePipeline.setupPhase).toHaveBeenCalledWith(mockServiceRegistry, undefined, expectedOptions)
            expect(corePipeline.fetchPhase).toHaveBeenCalledWith(mockServiceRegistry, expectedOptions)
            expect(corePipeline.refreshPhase).toHaveBeenCalledWith(mockServiceRegistry, expectedOptions)
            expect(corePipeline.processPhase).toHaveBeenCalledWith(mockServiceRegistry, expectedOptions)
            expect(corePipeline.uniqueAttributesPhase).toHaveBeenCalledWith(mockServiceRegistry, expectedOptions)

            expect(mockTimer.phase).toHaveBeenCalledTimes(5)
            expect(result).toEqual({
                ...mockFetchResult,
                totalProcessingTime: 1234,
                phaseTiming: { phase1: 100, phase2: 200 },
            })
        })
    })

    describe('generateReport', () => {
        it('should fetch ServiceRegistry.getCurrent() if not provided, and call generateAndSendFusionReport', async () => {
            const mockFusionAccount = {} as FusionAccount
            await generateReport(mockFusionAccount)

            expect(ServiceRegistry.getCurrent).toHaveBeenCalled()
            expect(mockReportsService.generateAndSendFusionReport).toHaveBeenCalledWith(
                mockFusionAccount,
                false,
                undefined
            )
        })

        it('should use provided serviceRegistry and call generateAndSendFusionReport with all args', async () => {
            const mockFusionAccount = {} as FusionAccount
            const mockStats = {} as AggregationStats

            jest.spyOn(ServiceRegistry, 'getCurrent').mockClear()

            await generateReport(mockFusionAccount, true, mockServiceRegistry as ServiceRegistry, mockStats)

            expect(ServiceRegistry.getCurrent).not.toHaveBeenCalled()
            expect(mockReportsService.generateAndSendFusionReport).toHaveBeenCalledWith(
                mockFusionAccount,
                true,
                mockStats
            )
        })
    })
})