import * as path from 'path'
import { recordingChainDir } from '../../../data/recordingPaths'
import { verifyScenarioRecording, printScenarioVerifyReport } from './harness/scenarioRecordingVerify'

const scenarioName =
    process.env.VERIFY_RECORDING_SCENARIO?.trim() ??
    (process.env.VERIFY_RECORDING_CHAIN?.trim()
        ? (console.warn('VERIFY_RECORDING_CHAIN is deprecated; use VERIFY_RECORDING_SCENARIO'), process.env.VERIFY_RECORDING_CHAIN.trim())
        : undefined)
const baseurl = process.env.BASEURL

describe.skipIf(!scenarioName)('verifyRecording CLI', () => {
    it(`verifies recording: ${scenarioName}`, async () => {
        const scenarioPath = path.join(recordingChainDir(scenarioName!, baseurl), 'scenario.json')
        const result = await verifyScenarioRecording(scenarioPath)
        printScenarioVerifyReport(result, scenarioName!)
        expect(result.success).toBe(true)
    })
})
