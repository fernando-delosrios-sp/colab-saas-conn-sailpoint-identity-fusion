import * as fs from 'fs'
import * as path from 'path'
import { recordingChainDir } from '../../../data/recordingPaths'
import {
    buildFernandoStep10MatchingSnapshot,
    isFernandoRecordingAvailable,
} from '../../../operations/__tests__/scenario/harness/fernandoMatchingReplay'
import { loadMatchingResultsRecording } from '../../../services/recordingService/reportArtifacts'

const CHAIN_REF = 'company12926-poc/fernando'
const MATCHING_RESULTS_PATH = path.join(recordingChainDir(CHAIN_REF), 'reports', 'matching-results.json')

function logDeferredMatches(deferredMatches: Array<{ accountName: string; accountId: string; matches?: Array<{ accountName: string; accountId: string; exact?: boolean; scores?: Array<{ attribute: string; algorithm: string; score: number; weightedScore?: number; isMatch?: boolean }> }> }>): void {
    console.log('\n=== DEFERRED MATCHES WITH SCORES ===')
    for (const row of [...deferredMatches].sort((a, b) => a.accountName.localeCompare(b.accountName))) {
        console.log(`\n--- ${row.accountName} (${row.accountId}) ---`)
        for (const match of row.matches ?? []) {
            const combined = match.scores?.find((s) => s.attribute === '__combined__')
            console.log(`  → ${match.accountName} (${match.accountId})`)
            console.log(`     exact: ${match.exact}, combined: ${combined?.score ?? 'n/a'}`)
            for (const s of match.scores ?? []) {
                if (s.attribute === '__combined__') continue
                console.log(
                    `     ${s.attribute} (${s.algorithm}): score=${s.score}, weighted=${s.weightedScore}, match=${s.isMatch}`
                )
            }
        }
    }
}

describe('fernando recording match replay', () => {
    it.skipIf(!isFernandoRecordingAvailable())(
        'validates deferred matching outcomes from recording artifact or live replay',
        async () => {
            const recording = loadMatchingResultsRecording(
                fs.existsSync(MATCHING_RESULTS_PATH)
                    ? JSON.parse(fs.readFileSync(MATCHING_RESULTS_PATH, 'utf8'))
                    : {}
            )
            const artifact =
                recording.runs.find((run) => run.stepId === 'step-10') ??
                recording.runs.reduce(
                    (best, run) =>
                        (run.deferredMatches?.length ?? 0) > (best.deferredMatches?.length ?? 0) ? run : best,
                    recording.runs[0]
                )

            if (artifact && (artifact.deferredMatches?.length ?? 0) > 0) {
                console.log('\n=== MATCH SWEEP RESULT (from matching-results.json) ===')
                console.log(JSON.stringify(artifact.sweepSummary, null, 2))
                logDeferredMatches(artifact.deferredMatches)

                expect(artifact.deferredMatches.length).toBe(12)
                expect(artifact.sweepSummary?.deferred).toBe(12)
                expect(artifact.sweepSummary?.nonMatch).toBe(24)
                return
            }

            const snapshot = await buildFernandoStep10MatchingSnapshot()

            console.log('\n=== MATCH SWEEP RESULT (replayed from api-log) ===')
            console.log(JSON.stringify(snapshot.sweepSummary, null, 2))
            logDeferredMatches(snapshot.deferredMatches)

            expect(snapshot.deferredMatches.length).toBe(12)
            expect(snapshot.sweepSummary?.deferred).toBe(12)
            expect(snapshot.sweepSummary?.nonMatch).toBe(24)
        }
    )
})
