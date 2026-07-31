#!/usr/bin/env node
const readline = require('readline')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { scenarioDir, parseRecordingScenarioRef } = require('./recording-paths.cjs')
const { finalizeChainArtifacts, countNdjsonLines } = require('./finalize-chain-artifacts.cjs')

function resolveRecordScenarioName() {
    if (process.env.RECORD_SCENARIO_NAME) {
        return process.env.RECORD_SCENARIO_NAME
    }
    if (process.env.RECORD_CHAIN_NAME) {
        console.warn('[deprecated] RECORD_CHAIN_NAME is deprecated; use RECORD_SCENARIO_NAME.')
        return process.env.RECORD_CHAIN_NAME
    }
    return undefined
}

function printDeprecationBanner() {
    console.warn('')
    console.warn('DEPRECATED: npm run record is deprecated for new capture workflows.')
    console.warn('Prefer External Settings: enable externalRecordingEnabled and set recordingName')
    console.warn('on your ISC proxy deployment. This CLI remains for local dev only.')
    console.warn('')
}

function ensureFinalized(logDir, scenarioRef) {
    const manifestPath = path.join(logDir, 'manifest.json')
    const scenarioPath = path.join(logDir, 'scenario.json')
    const apiLogPath = path.join(logDir, 'api-log.ndjson')
    const stepsPath = path.join(logDir, 'steps.ndjson')

    if (!fs.existsSync(scenarioPath) && fs.existsSync(stepsPath)) {
        console.log('Writing scenario.json and manifest.json from recorded steps...')
        try {
            const result = finalizeChainArtifacts(scenarioRef)
            console.log(`Finalized: ${result.stepCount} steps, ${result.apiLogEntryCount} api-log entries`)
        } catch (err) {
            console.warn(`WARNING: could not finalize artifacts: ${err.message}`)
        }
    }

    const apiLogLines = countNdjsonLines(apiLogPath)

    if (!fs.existsSync(manifestPath)) {
        console.warn(`WARNING: manifest.json not found at ${manifestPath}`)
    }
    if (!fs.existsSync(scenarioPath)) {
        console.warn(`WARNING: scenario.json not found at ${scenarioPath}`)
    }
    if (!fs.existsSync(apiLogPath)) {
        console.warn(`WARNING: api-log.ndjson not found at ${apiLogPath}`)
    } else if (apiLogLines === 0) {
        console.warn('WARNING: api-log.ndjson is empty — no ISC API calls were recorded')
    } else {
        console.log(`api-log.ndjson: ${apiLogLines} entries`)
    }

    if (fs.existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
            console.log(
                `manifest.json: store=${manifest.store}, steps=${manifest.stepCount}, api-log=${manifest.apiLogEntryCount}`
            )
        } catch {
            console.warn('WARNING: manifest.json could not be parsed')
        }
    }
}

printDeprecationBanner()

console.log('Identity Fusion NG — Scenario Test Recorder')
console.log('===========================================')
console.log('')

const envScenarioName = resolveRecordScenarioName()

function startRecording(scenarioInput) {
    const trimmed = (scenarioInput || '').trim()
    if (!trimmed) {
        console.error('Scenario reference is required (tenant/scenario)')
        process.exit(1)
    }

    let scenarioRef
    try {
        scenarioRef = parseRecordingScenarioRef(trimmed).scenarioRef
    } catch (err) {
        console.error(err.message)
        process.exit(1)
    }

    const logDir = scenarioDir(scenarioRef)
    const logFile = path.join(logDir, 'connector.log')
    const expectedArtifacts = [
        path.join(logDir, 'manifest.json'),
        path.join(logDir, 'scenario.json'),
        path.join(logDir, 'api-log.ndjson'),
        path.join(logDir, 'steps.ndjson'),
        path.join(logDir, 'phases.ndjson'),
        path.join(logDir, 'reports', 'aggregation.json'),
    ]

    fs.mkdirSync(logDir, { recursive: true })

    const logStream = fs.createWriteStream(logFile, { flags: 'w' })

    console.log(`Recording scenario: ${scenarioRef}`)
    console.log(`Artifact directory: ${logDir}`)
    console.log('Expected artifacts on exit:')
    for (const artifact of expectedArtifacts) {
        console.log(`  - ${path.relative(process.cwd(), artifact)}`)
    }
    console.log(`Connector log: ${logFile}`)
    console.log('Connector starting in record mode. Press Ctrl+C to stop and finalize.')
    console.log('')

    const child = spawn('npx', ['spcx', 'run', 'dist/index.js'], {
        env: {
            ...process.env,
            RECORD_MODE: 'true',
            RECORD_SCENARIO_NAME: scenarioRef,
            RECORD_CHAIN_NAME: scenarioRef,
            VERBOSE_RECORDING: 'true',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (d) => {
        logStream.write(d)
        process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
        logStream.write(d)
        process.stderr.write(d)
    })

    let shuttingDown = false

    const handleExit = () => {
        if (shuttingDown) return
        shuttingDown = true
        console.log('\nStopping connector — finalizing recording...')
        if (!child.killed) {
            child.kill('SIGINT')
        }
        setTimeout(() => {
            if (!child.killed) {
                child.kill('SIGTERM')
            }
        }, 8000)
    }

    process.on('SIGINT', handleExit)
    process.on('SIGTERM', handleExit)

    child.on('exit', (code) => {
        logStream.end()
        console.log('')
        setTimeout(() => {
            ensureFinalized(logDir, scenarioRef)
            console.log(`Recording artifacts under ${path.relative(process.cwd(), logDir)}/`)
            console.log(`Connector logs saved to: ${logFile}`)
            process.exit(code ?? 0)
        }, 300)
    })

    child.on('error', (err) => {
        console.error(`Failed to start connector: ${err.message}`)
        process.exit(1)
    })
}

if (envScenarioName) {
    startRecording(envScenarioName)
} else {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    rl.question('Enter scenario reference (tenant/scenario, e.g. company12926-poc/fernando): ', (scenarioInput) => {
        rl.close()
        startRecording(scenarioInput)
    })
}
