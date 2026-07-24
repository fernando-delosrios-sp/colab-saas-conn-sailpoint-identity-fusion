import { ServiceRegistry } from '../../../services/serviceRegistry'
import { generateReport } from '../generateReport'
import { AggregationStats } from '../../../services/fusionService/types'

describe('generateReport helpers', () => {
    let mockServiceRegistry: Partial<ServiceRegistry>
    let mockTimer: any
    let mockReportsService: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockTimer = {
            phase: vi.fn(),
            totalElapsed: vi.fn().mockReturnValue(1234),
            getPhaseBreakdown: vi.fn().mockReturnValue({ phase1: 100, phase2: 200 }),
        }

        mockReportsService = {
            generateAndSendFusionReport: vi.fn().mockResolvedValue(undefined),
        }

        mockServiceRegistry = {
            log: {
                timer: vi.fn().mockReturnValue(mockTimer),
            } as any,
            reports: mockReportsService,
        }

        vi.spyOn(ServiceRegistry, 'getCurrent').mockReturnValue(mockServiceRegistry as ServiceRegistry)
    })

    describe('generateReport', () => {
        it('should fetch ServiceRegistry.getCurrent() if not provided, and call generateAndSendFusionReport', async () => {
            await generateReport()

            expect(ServiceRegistry.getCurrent).toHaveBeenCalled()
            expect(mockReportsService.generateAndSendFusionReport).toHaveBeenCalledWith(false, undefined)
        })

        it('should use provided serviceRegistry and call generateAndSendFusionReport with all args', async () => {
            const mockStats = {} as AggregationStats

            vi.spyOn(ServiceRegistry, 'getCurrent').mockClear()

            await generateReport(true, mockServiceRegistry as ServiceRegistry, mockStats)

            expect(ServiceRegistry.getCurrent).not.toHaveBeenCalled()
            expect(mockReportsService.generateAndSendFusionReport).toHaveBeenCalledWith(true, mockStats)
        })
    })
})

