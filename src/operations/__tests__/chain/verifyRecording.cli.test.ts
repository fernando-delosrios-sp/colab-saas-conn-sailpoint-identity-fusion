import * as path from 'path'
import { recordingChainDir } from '../../../data/recordingPaths'
import { verifyChainRecording, printChainVerifyReport } from './harness/chainRecordingVerify'

const chainName = process.env.VERIFY_RECORDING_CHAIN?.trim()

describe.skipIf(!chainName)('verifyRecording CLI', () => {
    it(`verifies recording: ${chainName}`, async () => {
        const scenarioPath = path.join(recordingChainDir(chainName!), 'scenario.json')
        const result = await verifyChainRecording(scenarioPath)
        printChainVerifyReport(result, chainName!)
        expect(result.success).toBe(true)
    })
})
