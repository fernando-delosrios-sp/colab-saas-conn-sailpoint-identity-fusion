import * as fs from 'fs'
import * as path from 'path'
import { recordingChainDir } from '../../../data/recordingPaths'
import {
    buildFernandoStep10MatchingSnapshot,
    isFernandoRecordingAvailable,
} from '../../../operations/__tests__/scenario/harness/fernandoMatchingReplay'
import { loadMatchingResultsRecording } from '../../../services/recordingService/reportArtifacts'
import type { MatchingResultsSnapshot } from '../../recordingService/matchingResultsSnapshot'

const CHAIN_REF = 'company12926-poc/fernando'
const MATCHING_RESULTS_PATH = path.join(recordingChainDir(CHAIN_REF), 'reports', 'matching-results.json')

type DeferredMatches = MatchingResultsSnapshot['deferredMatches']

/** Order-independent view of each deferred account and the candidates it scored against. */
function summarizeDeferredMatches(deferredMatches: DeferredMatches): Record<string, string[]> {
    const summary: Record<string, string[]> = {}
    for (const row of deferredMatches) {
        summary[row.accountName] = (row.matches ?? [])
            .map((match) => {
                const combined = match.scores?.find((score) => score.attribute.toLowerCase().startsWith('combined'))
                return `${match.accountName} exact=${match.exact} combined=${combined?.score ?? 'n/a'}`
            })
            .sort()
    }
    return summary
}

function loadRecordedStep10() {
    if (!fs.existsSync(MATCHING_RESULTS_PATH)) return undefined
    const recording = loadMatchingResultsRecording(JSON.parse(fs.readFileSync(MATCHING_RESULTS_PATH, 'utf8')))
    return recording.runs.find((run) => run.stepId === 'step-10')
}

describe('fernando recording match replay', () => {
    it.skipIf(!isFernandoRecordingAvailable())(
        'replays deferred matching from the api-log and reproduces the recorded outcomes',
        async () => {
            const snapshot = await buildFernandoStep10MatchingSnapshot()

            expect(snapshot.sweepSummary).toMatchObject({ deferred: 12, nonMatch: 24 })
            expect(snapshot.deferredMatches.length).toBe(12)

            const recorded = loadRecordedStep10()
            if (!recorded || (recorded.deferredMatches?.length ?? 0) === 0) return

            expect(snapshot.sweepSummary).toEqual(recorded.sweepSummary)
            expect(summarizeDeferredMatches(snapshot.deferredMatches)).toEqual(
                summarizeDeferredMatches(recorded.deferredMatches)
            )
        }
    )
})
