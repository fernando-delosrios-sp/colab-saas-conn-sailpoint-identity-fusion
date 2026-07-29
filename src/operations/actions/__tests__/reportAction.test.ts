import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { reportAction } from '../reportAction'
import { buildReportAggregationStats } from '../../helpers/accountListPhases'

vi.mock('../../helpers/accountListPhases', () => ({
    buildReportContext: vi.fn(),
    buildReportAggregationStats: vi.fn(),
}))

vi.mock('../../helpers/generateReport', () => ({
    generateReport: vi.fn(),
}))

import { buildReportContext } from '../../helpers/accountListPhases'
import { generateReport } from '../../helpers/generateReport'

describe('reportAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('runs report pipeline on Add', async () => {
        const fetchResult = { identitiesFound: 1, managedAccountsFound: 2 } as any
        const timer = { totalElapsed: () => 100, getPhaseBreakdown: () => ({}) } as any
        vi.mocked(buildReportContext).mockResolvedValue({ fetchResult, timer })
        vi.mocked(buildReportAggregationStats).mockReturnValue({ identitiesFound: 1 } as any)
        vi.mocked(generateReport).mockResolvedValue(undefined)

        const serviceRegistry = { identities: {} } as any
        const fusionAccount = {} as any

        await reportAction(fusionAccount, { op: AttributeChangeOp.Add, value: true }, serviceRegistry)

        expect(buildReportContext).toHaveBeenCalledWith(serviceRegistry)
        expect(buildReportAggregationStats).toHaveBeenCalledWith(fetchResult, timer, serviceRegistry.identities)
        expect(generateReport).toHaveBeenCalledWith(false, serviceRegistry, { identitiesFound: 1 })
    })

    it('does nothing on Remove', async () => {
        await reportAction({} as any, { op: AttributeChangeOp.Remove, value: true }, {} as any)
        expect(buildReportContext).not.toHaveBeenCalled()
        expect(generateReport).not.toHaveBeenCalled()
    })
})
