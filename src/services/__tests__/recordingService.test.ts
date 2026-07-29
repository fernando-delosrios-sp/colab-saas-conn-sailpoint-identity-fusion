import { RecordingService } from '../recordingService'
import { LogService } from '../logService'
import { FusionConfig } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'

describe('RecordingService', () => {
    const config = {
        recording: { chainName: 'unit-test-chain' },
    } as FusionConfig

    afterEach(() => {
        ;(RecordingService as any).instance = undefined
    })

    it('returns singleton via init', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const a = RecordingService.init(log, config)
        const b = RecordingService.getInstance()
        expect(a).toBe(b)
        expect(a.getName()).toBe('unit-test-chain')
    })

    it('records operation steps via startOperation/endOperation', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const uniqueConfig = {
            recording: { chainName: `unit-test-chain-${Date.now()}` },
        } as FusionConfig
        ;(RecordingService as any).instance = undefined
        const service = RecordingService.init(log, uniqueConfig)
        const run = new FusionRun()
        run.log = log
        const sent: unknown[] = []
        const res = { send: (value: unknown) => sent.push(value) }

        service.startOperation('accountList', { dryRun: true }, res, run)
        res.send({ key: 'acct-1' })
        service.endOperation(run)

        expect(service.getStepCount()).toBe(1)
        expect(service.getSteps()[0].output).toEqual([{ key: 'acct-1' }])
    })
})
