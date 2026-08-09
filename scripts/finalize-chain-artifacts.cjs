const fs = require('fs')
const path = require('path')
const { chainDir, parseRecordingChainRef } = require('./recording-paths.cjs')

function countNdjsonLines(filePath) {
    if (!fs.existsSync(filePath)) return 0
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (!content) return 0
    return content.split('\n').filter(Boolean).length
}

function loadStepsFromDisk(dir) {
    const stepsFile = path.join(dir, 'steps.ndjson')
    if (!fs.existsSync(stepsFile)) return []

    const byId = new Map()
    for (const line of fs.readFileSync(stepsFile, 'utf-8').trim().split('\n')) {
        if (!line) continue
        try {
            const step = JSON.parse(line)
            byId.set(step.stepId, step)
        } catch {
            /* skip malformed */
        }
    }

    return Array.from(byId.values()).sort((a, b) => {
        const na = parseInt(String(a.stepId).replace('step-', ''), 10)
        const nb = parseInt(String(b.stepId).replace('step-', ''), 10)
        return na - nb
    })
}

function loadExistingConfig(dir) {
    const scenarioPath = path.join(dir, 'scenario.json')
    if (!fs.existsSync(scenarioPath)) return {}
    try {
        const existing = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'))
        if (existing.config && typeof existing.config === 'object' && Object.keys(existing.config).length > 0) {
            return existing.config
        }
    } catch {
        /* ignore malformed scenario */
    }
    return {}
}

function buildScenario(chainName, steps, dir) {
    const config = loadExistingConfig(dir)
    const firstStep = steps[0]
    const firstState = firstStep?.stateAfter
    const initialState = firstState
        ? {
              identities: firstState.identities ?? [],
              managedAccounts: firstState.managedAccounts ?? [],
              fusionAccounts: firstState.fusionAccounts ?? [],
              fusionIdentityDecisions: firstState.fusionIdentityDecisions ?? [],
          }
        : {
              identities: [],
              managedAccounts: [],
              fusionAccounts: [],
              fusionIdentityDecisions: [],
          }

    const scenarioSteps = steps.map((step) => ({
        id: step.stepId,
        operation: step.operation,
        sweep: step.sweep,
        description: `Recorded ${step.operation} — ${step.duration}ms, ${step.output.length} outputs`,
        input: step.input ?? {},
        expectedOutput:
            step.output.length > 0 ? (step.output.length === 1 ? step.output[0] : step.output) : undefined,
        expectedStateDelta: step.stateAfter,
    }))

    const referenceValues = {}
    for (const step of steps) {
        const state = step.stateAfter ?? {}
        referenceValues[step.stepId] = {
            outputCount: step.output.length,
            durationMs: step.duration,
            managedAccountsCount: state.managedAccounts?.length ?? 0,
            fusionAccountsCount: state.fusionAccounts?.length ?? 0,
            identitiesCount: state.identities?.length ?? 0,
            fusionIdentityDecisionsCount: state.fusionIdentityDecisions?.length ?? 0,
        }
    }

    return {
        version: '1.0.0',
        recordedAt: new Date().toISOString(),
        scenarioName: chainName,
        chainName: chainName,
        config,
        initialState,
        steps: scenarioSteps,
        referenceValues,
        apiLogPath: path.relative(process.cwd(), path.join(dir, 'api-log.ndjson')),
    }
}

/** Writes scenario.json and manifest.json from on-disk steps/api-log. */
function finalizeChainArtifacts(chainRef) {
    const { chainRef: normalized } = parseRecordingChainRef(chainRef)
    const dir = chainDir(normalized)
    const steps = loadStepsFromDisk(dir)
    const apiLogPath = path.join(dir, 'api-log.ndjson')
    const apiLogEntryCount = countNdjsonLines(apiLogPath)
    const phasesPath = path.join(dir, 'phases.ndjson')
    const scenarioPath = path.join(dir, 'scenario.json')
    const manifestPath = path.join(dir, 'manifest.json')
    const stepsPath = path.join(dir, 'steps.ndjson')
    const reportsPath = path.join(dir, 'reports', 'aggregation.json')

    const scenario = buildScenario(normalized, steps, dir)
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + '\n')

    const matchingResultsPath = path.join(dir, 'reports', 'matching-results.json')
    const artifactPaths = [
        path.relative(process.cwd(), scenarioPath),
        path.relative(process.cwd(), apiLogPath),
        path.relative(process.cwd(), stepsPath),
    ]
    if (fs.existsSync(phasesPath)) {
        artifactPaths.push(path.relative(process.cwd(), phasesPath))
    }
    if (fs.existsSync(reportsPath)) {
        artifactPaths.push(path.relative(process.cwd(), reportsPath))
    }
    if (fs.existsSync(matchingResultsPath)) {
        artifactPaths.push(path.relative(process.cwd(), matchingResultsPath))
    }

    const manifest = {
        version: '1.0.0',
        store: 'ndjson',
        scenarioName: normalized,
        chainName: normalized,
        recordedAt: new Date().toISOString(),
        apiLogPath: path.relative(process.cwd(), apiLogPath),
        apiLogEntryCount,
        stepsPath: path.relative(process.cwd(), stepsPath),
        stepCount: steps.length,
        phasesPath: fs.existsSync(phasesPath) ? path.relative(process.cwd(), phasesPath) : undefined,
        phaseCount: countNdjsonLines(phasesPath),
        scenarioPath: path.relative(process.cwd(), scenarioPath),
        reportsPath: fs.existsSync(reportsPath) ? path.relative(process.cwd(), reportsPath) : undefined,
        matchingResultsPath: fs.existsSync(matchingResultsPath)
            ? path.relative(process.cwd(), matchingResultsPath)
            : undefined,
        artifactPaths,
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

    return { dir, scenarioPath, manifestPath, stepCount: steps.length, apiLogEntryCount }
}

module.exports = { finalizeChainArtifacts, countNdjsonLines, loadStepsFromDisk, buildScenario, loadExistingConfig }



