import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { reportAction } from '../reportAction'

vi.mock('../../../services/reportPipeline', () => ({
    runReportPipeline: vi.fn(),
}))

import { runReportPipeline } from '../../../services/reportPipeline'

describe('reportAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('runs report pipeline on Add', async () => {
        vi.mocked(runReportPipeline).mockResolvedValue(undefined)
        const serviceRegistry = { identities: {} } as any

        await reportAction({} as any, { op: AttributeChangeOp.Add, value: true }, serviceRegistry)

        expect(runReportPipeline).toHaveBeenCalledWith(serviceRegistry, false)
    })

    it('does nothing on Remove', async () => {
        await reportAction({} as any, { op: AttributeChangeOp.Remove, value: true }, {} as any)
        expect(runReportPipeline).not.toHaveBeenCalled()
    })
})
