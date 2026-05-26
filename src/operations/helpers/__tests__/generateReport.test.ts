import { ServiceRegistry } from '../../../services/serviceRegistry'
import { fetchAndProcessForReport, generateReport } from '../generateReport'
import * as corePipeline from '../corePipeline'
import { AggregationStats } from '../../../services/fusionService/types'

jest.mock('../corePipeline', () => ({
    PipelineRunner: {
        run: jest.fn(),
    },
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
            ;(corePipeline.PipelineRunner.run as jest.Mock).mockResolvedValue({
                shouldContinue: false,
                timer: mockTimer,
            })

            const result = await fetchAndProcessForReport(mockServiceRegistry as ServiceRegistry)

            expect(corePipeline.PipelineRunner.run).toHaveBeenCalledWith(mockServiceRegistry, {
                mode: { kind: 'dry-run' },
                targetPhase: 'uniqueAttributes',
            })
            expect(result).toEqual({
                identitiesFound: 0,
                managedAccountsFound: 0,
                totalProcessingTime: 1234,
            })
        })
        it('should execute all phases and return stats if setupPhase returns true', async () => {
            const mockFetchResult = {
                identitiesFound: 10,
                managedAccountsFound: 20,
                managedAccountsFoundAuthoritative: 5,
                managedAccountsFoundRecord: 15,
                managedAccountsFoundOrphan: 2,
            }
            ;(corePipeline.PipelineRunner.run as jest.Mock).mockResolvedValue({
                shouldContinue: true,
                fetchResult: mockFetchResult,
                timer: mockTimer,
            })

            const result = await fetchAndProcessForReport(mockServiceRegistry as ServiceRegistry)

            expect(corePipeline.PipelineRunner.run).toHaveBeenCalledWith(mockServiceRegistry, {
                mode: { kind: 'dry-run' },
                targetPhase: 'uniqueAttributes',
            })

            expect(result).toEqual({
                ...mockFetchResult,
                totalProcessingTime: 1234,
                phaseTiming: { phase1: 100, phase2: 200 },
            })
        })
    })

    describe('generateReport', () => {
        it('should fetch ServiceRegistry.getCurrent() if not provided, and call generateAndSendFusionReport', async () => {
            await generateReport()

            expect(ServiceRegistry.getCurrent).toHaveBeenCalled()
            expect(mockReportsService.generateAndSendFusionReport).toHaveBeenCalledWith(false, undefined)
        })

        it('should use provided serviceRegistry and call generateAndSendFusionReport with all args', async () => {
            const mockStats = {} as AggregationStats

            jest.spyOn(ServiceRegistry, 'getCurrent').mockClear()

            await generateReport(true, mockServiceRegistry as ServiceRegistry, mockStats)

            expect(ServiceRegistry.getCurrent).not.toHaveBeenCalled()
            expect(mockReportsService.generateAndSendFusionReport).toHaveBeenCalledWith(true, mockStats)
        })
    })
})
