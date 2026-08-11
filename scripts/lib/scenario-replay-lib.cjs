const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { spawn } = require('child_process')
const { compareOutputs } = require('../scenario-replay-compare.cjs')
const {
    scenarioDir,
    parseRecordingScenarioRef,
    resolveScenarioRefFromArgv,
} = require('../recording-paths.cjs')
const { finalizeChainArtifacts, countNdjsonLines } = require('../finalize-chain-artifacts.cjs')
const { loadDotEnv } = require('../loadDotEnv.cjs')

const OPERATION_TYPE_MAP = {
    testConnection: 'std:test-connection',
    accountList: 'std:account:list',
    accountRead: 'std:account:read',
    accountCreate: 'std:account:create',
    accountUpdate: 'std:account:update',
    accountEnable: 'std:account:enable',
    accountDisable: 'std:account:disable',
    entitlementList: 'std:entitlement:list',
    accountDiscoverSchema: 'std:account:discover-schema',
}

function operationTypeMap(operation) {
    const type = OPERATION_TYPE_MAP[operation]
    if (!type) {
        throw new Error(`Unknown scenario operation: ${operation}`)
    }
    return type
}

function sanitizeScenarioConfigForReplay(config) {
    const clean = { ...(config ?? {}) }
    delete clean.batchCumulativeCount
    delete clean.acctAggregationStart
    delete clean.acctAggregationEnd
    delete clean.cloudCacheUpdate
    return clean
}

function parseOrchestratorArgv(argv) {
    const flags = {
        noVerify: false,
        pauseOnFail: false,
        step: undefined,
        port: Number(process.env.PORT) || 3000,
    }
    const positional = []

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--no-verify') {
            flags.noVerify = true
        } else if (arg === '--pause-on-fail') {
            flags.pauseOnFail = true
        } else if (arg === '--step') {
            flags.step = argv[++i]
            if (!flags.step) {
                throw new Error('--step requires a step id')
            }
        } else if (arg === '--port') {
            flags.port = Number(argv[++i])
            if (!Number.isFinite(flags.port)) {
                throw new Error('--port requires a numeric value')
            }
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`)
        } else {
            positional.push(arg)
        }
    }

    const scenarioRef = resolveScenarioRefFromArgv(['node', 'orchestrator', ...positional])
    return { flags, scenarioRef }
}

function validateScenarioDir(scenarioRefInput) {
    const { scenarioRef } = parseRecordingScenarioRef(scenarioRefInput)
    const dir = scenarioDir(scenarioRef)
    const scenarioPath = path.join(dir, 'scenario.json')
    const apiLogPath = path.join(dir, 'api-log.ndjson')
    const stepsPath = path.join(dir, 'steps.ndjson')

    if (!fs.existsSync(dir)) {
        throw new Error(`Scenario directory not found: ${dir}`)
    }

    if (!fs.existsSync(apiLogPath)) {
        throw new Error(`api-log.ndjson not found at ${apiLogPath}`)
    }

    const apiLogLines = countNdjsonLines(apiLogPath)
    if (apiLogLines === 0) {
        throw new Error('api-log.ndjson is empty — nothing to replay')
    }

    if (!fs.existsSync(scenarioPath) && fs.existsSync(stepsPath)) {
        finalizeChainArtifacts(scenarioRef)
    }

    if (!fs.existsSync(scenarioPath)) {
        throw new Error(`scenario.json not found at ${scenarioPath}`)
    }

    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'))
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
        throw new Error('scenario.json has no steps')
    }

    return { dir, scenarioRef, scenarioPath, scenario }
}

function buildReplayConfig(scenario, scenarioRef) {
    loadDotEnv()
    const sanitized = sanitizeScenarioConfigForReplay(scenario.config)
    return {
        ...sanitized,
        baseurl: sanitized.baseurl || process.env.BASEURL || process.env.ISC_BASEURL,
        clientId: sanitized.clientId || process.env.clientId || process.env.CLIENT_ID || 'replay-client-id',
        clientSecret:
            sanitized.clientSecret || process.env.clientSecret || process.env.CLIENT_SECRET || 'replay-client-secret',
        spConnectorInstanceId:
            sanitized.spConnectorInstanceId || process.env.spConnectorInstanceId || 'replay-orchestrator',
        recording: {
            mode: 'replay',
            scenarioName: scenarioRef,
            chainName: scenarioRef,
            store: 'ndjson',
        },
    }
}

function loadStepTimestamps(dir) {
    const stepsPath = path.join(dir, 'steps.ndjson')
    if (!fs.existsSync(stepsPath)) return {}

    const timestamps = {}
    for (const line of fs.readFileSync(stepsPath, 'utf-8').trim().split('\n')) {
        if (!line) continue
        try {
            const step = JSON.parse(line)
            if (step.stepId && step.timestamp) {
                timestamps[step.stepId] = step.timestamp
            }
        } catch {
            /* skip malformed lines */
        }
    }
    return timestamps
}

function buildStepCommand(step, scenario, scenarioRef, stepTimestamps = {}) {
    const replayConfig = buildReplayConfig(scenario, scenarioRef)
    const replayStepTimestamp = stepTimestamps[step.id] ?? scenario.recordedAt
    return {
        type: operationTypeMap(step.operation),
        input: step.input ?? {},
        config: {
            ...replayConfig,
            recording: {
                ...replayConfig.recording,
                ...(replayStepTimestamp ? { replayStepTimestamp } : {}),
            },
        },
    }
}

function parseNdjsonResponse(text) {
    const outputs = []
    for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
            outputs.push(JSON.parse(trimmed))
        } catch {
            /* skip malformed lines */
        }
    }
    return outputs
}

function printStepBanner(step, index, total) {
    const lines = [
        '',
        '═'.repeat(72),
        `Step ${index + 1}/${total}: ${step.id} — ${step.operation}`,
        step.description ? `  ${step.description}` : '',
        '═'.repeat(72),
    ].filter(Boolean)
    return lines.join('\n')
}

function pauseForUser(message) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        rl.question(message, () => {
            rl.close()
            resolve()
        })
    })
}

async function defaultPostStep(baseUrl, command) {
    const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
    })
    const text = await res.text()
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`)
    }
    return parseNdjsonResponse(text)
}

function defaultSpawnProxy(scenarioRef, port, scriptsDir) {
    const proxyScript = path.join(scriptsDir, 'proxy-server.cjs')
    const child = spawn(process.execPath, [proxyScript, 'dist/index.js', String(port)], {
        env: {
            ...process.env,
            REPLAY_MODE: 'true',
            RECORD_SCENARIO_NAME: scenarioRef,
            RECORD_CHAIN_NAME: scenarioRef,
            VERBOSE_RECORDING: process.env.VERBOSE_RECORDING ?? 'true',
            PORT: String(port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))

    return child
}

async function defaultWaitForPort(port) {
    const waitOn = require('wait-on')
    await waitOn({ resources: [`tcp:${port}`], timeout: 120000, interval: 250, window: 1000 })
}

function writeReplayReport(dir, report) {
    const reportPath = path.join(dir, 'replay-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
    return reportPath
}

/**
 * Runs scenario replay steps against a connector HTTP endpoint.
 * Injectable dependencies support integration tests without spawning proxy-server.
 */
async function runScenarioReplay({
    scenarioRef,
    flags = {},
    postStep = defaultPostStep,
    spawnProxy = defaultSpawnProxy,
    waitForPort = defaultWaitForPort,
    log = console.log,
    scriptsDir = path.join(__dirname, '..'),
}) {
    const { dir, scenarioRef: normalizedRef, scenario } = validateScenarioDir(scenarioRef)
    const stepTimestamps = loadStepTimestamps(dir)
    const port = flags.port ?? 3000
    const baseUrl = `http://localhost:${port}`
    const steps = flags.step ? scenario.steps.filter((s) => s.id === flags.step) : scenario.steps

    if (flags.step && steps.length === 0) {
        throw new Error(`Step not found: ${flags.step}`)
    }

    let proxyChild
    const startedAt = new Date().toISOString()
    const stepResults = []
    let failed = false

    try {
        proxyChild = spawnProxy(normalizedRef, port, scriptsDir)
        await waitForPort(port)

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i]
            log(printStepBanner(step, i, steps.length))

            const stepResult = {
                stepId: step.id,
                operation: step.operation,
                success: true,
                skippedComparison: flags.noVerify === true,
                drift: [],
                outputCount: 0,
                error: undefined,
            }

            try {
                const command = buildStepCommand(step, scenario, normalizedRef, stepTimestamps)
                const outputs = await postStep(baseUrl, command)
                stepResult.outputCount = outputs.length

                if (!flags.noVerify && step.expectedOutput !== undefined && step.expectedOutput !== null) {
                    const label = flags.step ? step.id : `${step.id} (index ${i})`
                    const { match, drift } = compareOutputs(outputs, step.expectedOutput, label)
                    stepResult.drift = drift
                    if (!match) {
                        stepResult.success = false
                        failed = true
                        for (const line of drift) {
                            log(`  DRIFT: ${line}`)
                        }
                        if (flags.pauseOnFail) {
                            await pauseForUser('Press Enter to continue...')
                        }
                    }
                }
            } catch (err) {
                stepResult.success = false
                stepResult.error = err instanceof Error ? err.message : String(err)
                failed = true
                log(`  ERROR: ${stepResult.error}`)
                if (flags.pauseOnFail) {
                    await pauseForUser('Press Enter to continue...')
                }
            }

            stepResults.push(stepResult)
        }
    } finally {
        if (proxyChild && !proxyChild.killed) {
            proxyChild.kill('SIGTERM')
        }
    }

    const report = {
        version: '1.0.0',
        scenarioRef: normalizedRef,
        startedAt,
        completedAt: new Date().toISOString(),
        success: !failed,
        flags: {
            noVerify: flags.noVerify === true,
            pauseOnFail: flags.pauseOnFail === true,
            step: flags.step ?? null,
        },
        stepsExecuted: stepResults.length,
        stepsFailed: stepResults.filter((r) => !r.success).length,
        stepResults,
    }

    const reportPath = writeReplayReport(dir, report)
    log('')
    log(`Replay report: ${path.relative(process.cwd(), reportPath)}`)
    log(failed ? 'Replay FAILED' : 'Replay PASSED')

    return { failed, report, reportPath }
}

module.exports = {
    OPERATION_TYPE_MAP,
    operationTypeMap,
    sanitizeScenarioConfigForReplay,
    parseOrchestratorArgv,
    validateScenarioDir,
    buildReplayConfig,
    loadStepTimestamps,
    buildStepCommand,
    parseNdjsonResponse,
    compareOutputs,
    runScenarioReplay,
    writeReplayReport,
    printStepBanner,
}

