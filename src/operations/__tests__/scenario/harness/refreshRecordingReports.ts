import * as fs from 'fs'
import * as path from 'path'
import { recordingScenarioDir } from '../../../../data/recordingPaths'
import {
    loadAggregationReportRecording,
    loadMatchingResultsRecording,
    type AggregationReportRecording,
    type MatchingResultsRecording,
} from '../../../../services/recordingService/reportArtifacts'
import type { MatchingResultsSnapshot } from '../../../../services/recordingService/matchingResultsSnapshot'
import {
    buildFernandoStep10MatchingSnapshot,
    FERNANDO_SCENARIO_REF,
    isFernandoRecordingAvailable,
} from './fernandoMatchingReplay'

/** Regenerates v1.1.0 report artifacts and manifest metadata for a scenario directory. */
export async function refreshScenarioReports(scenarioRef: string): Promise<void> {
    const dir = recordingScenarioDir(scenarioRef)
    if (!fs.existsSync(dir)) {
        throw new Error(`Scenario directory not found: ${dir}`)
    }

    await refreshMatchingResults(scenarioRef, dir)
    refreshAggregationReport(dir)
    refreshManifest(scenarioRef, dir)
}

async function refreshMatchingResults(scenarioRef: string, dir: string): Promise<void> {
    const reportsDir = path.join(dir, 'reports')
    fs.mkdirSync(reportsDir, { recursive: true })
    const matchingPath = path.join(reportsDir, 'matching-results.json')

    const priorRaw = fs.existsSync(matchingPath) ? JSON.parse(fs.readFileSync(matchingPath, 'utf8')) : {}
    const existing = loadMatchingResultsRecording(priorRaw)
    const legacyFlat = !Array.isArray(priorRaw.runs) && priorRaw.version === '1.0.0' ? (priorRaw as MatchingResultsSnapshot) : undefined

    const runs: MatchingResultsSnapshot[] = existing.runs.filter((run) => Boolean(run.stepId))

    if (scenarioRef === FERNANDO_SCENARIO_REF && isFernandoRecordingAvailable()) {
        const step10 = runs.find((run) => run.stepId === 'step-10')
        if (!step10 || (step10.deferredMatches?.length ?? 0) === 0) {
            upsertRun(runs, await buildFernandoStep10MatchingSnapshot())
        }
    }

    if (!runs.some((run) => run.stepId === 'step-23')) {
        const step23Timestamp = loadStepTimestamp(dir, 'step-23')
        upsertRun(runs, {
            version: '1.0.0',
            recordedAt: step23Timestamp ?? legacyFlat?.recordedAt ?? new Date().toISOString(),
            operation: 'accountList',
            stepId: 'step-23',
            sweepSummary: legacyFlat?.sweepSummary ?? {
                processed: 27,
                exact: 0,
                partial: 0,
                deferred: 0,
                nonMatch: 0,
            },
            identityMatches: legacyFlat?.identityMatches ?? [],
            deferredMatches: legacyFlat?.deferredMatches ?? [],
            nonMatches: legacyFlat?.nonMatches ?? [],
            failedMatches: legacyFlat?.failedMatches ?? [],
        })
    }

    const recording: MatchingResultsRecording = { version: '1.1.0', runs }
    fs.writeFileSync(matchingPath, JSON.stringify(recording, null, 2) + '\n')
}

function refreshAggregationReport(dir: string): void {
    const aggregationPath = path.join(dir, 'reports', 'aggregation.json')
    if (!fs.existsSync(aggregationPath)) return

    const raw = JSON.parse(fs.readFileSync(aggregationPath, 'utf8'))
    const existing = loadAggregationReportRecording(raw)
    if (isAggregationReportRecordingComplete(existing)) return

    const legacyReport =
        existing.runs.length === 1 && existing.runs[0].report
            ? existing.runs[0].report
            : raw.stats || raw.accounts
              ? raw
              : null
    if (!legacyReport) return

    const recording: AggregationReportRecording = {
        version: '1.1.0',
        runs: [
            {
                stepId: 'step-23',
                recordedAt: loadStepTimestamp(dir, 'step-23') ?? new Date().toISOString(),
                report: legacyReport as Record<string, unknown>,
            },
        ],
    }
    fs.writeFileSync(aggregationPath, JSON.stringify(recording, null, 2) + '\n')
}

function refreshManifest(scenarioRef: string, dir: string): void {
    const manifestPath = path.join(dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.scenarioName = scenarioRef
    manifest.chainName = scenarioRef

    const matchingResultsRel = path.join('recordings', ...scenarioRef.split('/'), 'reports', 'matching-results.json')
    const aggregationRel = path.join('recordings', ...scenarioRef.split('/'), 'reports', 'aggregation.json')

    if (fs.existsSync(path.join(dir, 'reports', 'matching-results.json'))) {
        manifest.matchingResultsPath = matchingResultsRel
    }
    if (fs.existsSync(path.join(dir, 'reports', 'aggregation.json'))) {
        manifest.reportsPath = aggregationRel
    }

    const artifactPaths = new Set<string>(manifest.artifactPaths ?? [])
    for (const rel of [
        manifest.scenarioPath,
        manifest.apiLogPath,
        manifest.stepsPath,
        manifest.phasesPath,
        manifest.matchingResultsPath,
        manifest.reportsPath,
    ]) {
        if (rel) artifactPaths.add(rel)
    }
    manifest.artifactPaths = [...artifactPaths]
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

    const scenarioPath = path.join(dir, 'scenario.json')
    if (fs.existsSync(scenarioPath)) {
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
        scenario.scenarioName = scenarioRef
        scenario.chainName = scenarioRef
        if (manifest.matchingResultsPath) {
            scenario.matchingResultsPath = manifest.matchingResultsPath
        }
        fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + '\n')
    }
}

function upsertRun(runs: MatchingResultsSnapshot[], snapshot: MatchingResultsSnapshot): void {
    const index = runs.findIndex((run) => run.stepId === snapshot.stepId)
    if (index >= 0) {
        runs[index] = snapshot
    } else {
        runs.push(snapshot)
    }
    runs.sort((a, b) => {
        const na = parseInt(String(a.stepId ?? '').replace('step-', ''), 10)
        const nb = parseInt(String(b.stepId ?? '').replace('step-', ''), 10)
        return na - nb
    })
}

function loadStepTimestamp(dir: string, stepId: string): string | undefined {
    const stepsPath = path.join(dir, 'steps.ndjson')
    if (!fs.existsSync(stepsPath)) return undefined
    const steps = fs
        .readFileSync(stepsPath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    return steps.find((step: { stepId?: string }) => step.stepId === stepId)?.timestamp
}

function isAggregationReportRecordingComplete(existing: AggregationReportRecording): boolean {
    return existing.version === '1.1.0' && existing.runs.length > 0 && existing.runs.every((run) => run.stepId)
}
