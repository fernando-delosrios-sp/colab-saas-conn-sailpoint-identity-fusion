import * as path from 'path'
import * as fs from 'fs'
import { recordingChainDir } from '../../../data/recordingPaths'
import { refreshScenarioReports } from './harness/refreshRecordingReports'
import { loadMatchingResultsRecording, isAggregationReportRecording } from '../../../services/recordingService/reportArtifacts'

const scenarioName = process.env.REFRESH_RECORDING_SCENARIO?.trim()

describe.skipIf(!scenarioName)('refreshRecordingReports CLI', () => {
    it(`refreshes report artifacts: ${scenarioName}`, async () => {
        await refreshScenarioReports(scenarioName!)

        const dir = recordingChainDir(scenarioName!)
        const matchingPath = path.join(dir, 'reports', 'matching-results.json')
        const aggregationPath = path.join(dir, 'reports', 'aggregation.json')
        const manifestPath = path.join(dir, 'manifest.json')

        expect(fs.existsSync(matchingPath)).toBe(true)
        const matching = loadMatchingResultsRecording(JSON.parse(fs.readFileSync(matchingPath, 'utf8')))
        expect(matching.version).toBe('1.1.0')
        expect(matching.runs.length).toBeGreaterThan(0)

        if (fs.existsSync(aggregationPath)) {
            const aggregation = JSON.parse(fs.readFileSync(aggregationPath, 'utf8'))
            expect(isAggregationReportRecording(aggregation)).toBe(true)
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        expect(manifest.scenarioName).toBe(scenarioName)
        expect(manifest.matchingResultsPath).toContain('matching-results.json')
    })
})
