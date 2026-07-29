#!/usr/bin/env node
const readline = require('readline')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { chainDir } = require('./recording-paths.cjs')
const { finalizeChainArtifacts, countNdjsonLines } = require('./finalize-chain-artifacts.cjs')

function ensureFinalized(logDir, safeName) {
    const manifestPath = path.join(logDir, 'manifest.json')
    const scenarioPath = path.join(logDir, 'scenario.json')
    const apiLogPath = path.join(logDir, 'api-log.ndjson')
    const stepsPath = path.join(logDir, 'steps.ndjson')

    if (!fs.existsSync(scenarioPath) && fs.existsSync(stepsPath)) {
        console.log('Writing scenario.json and manifest.json from recorded steps...')
        try {
            const result = finalizeChainArtifacts(safeName)
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

console.log('Identity Fusion NG — Chain Test Recorder')
console.log('=========================================')
console.log('')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

rl.question('Enter chain name: ', (chainName) => {
    const trimmed = (chainName || '').trim()
    if (!trimmed) {
        console.error('Chain name is required')
        process.exit(1)
    }

    const safeName = trimmed.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
    const logDir = chainDir(safeName)
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

    console.log(`Recording to chain: ${safeName}`)
    console.log(`Artifact directory: ${logDir}`)
    console.log('Expected artifacts on exit:')
    for (const artifact of expectedArtifacts) {
        console.log(`  - ${path.relative(process.cwd(), artifact)}`)
    }
    console.log(`Connector log: ${logFile}`)
    console.log('Connector starting in record mode. Press Ctrl+C to stop and finalize.')
    console.log('')

    rl.close()

    const child = spawn('npx', ['spcx', 'run', 'dist/index.js'], {
        env: {
            ...process.env,
            RECORD_MODE: 'true',
            RECORD_CHAIN_NAME: safeName,
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
        // spcx often exits before the connector async SIGINT handler completes
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
        // Brief pause so async api-log writes can flush before reading artifacts from disk
        setTimeout(() => {
            ensureFinalized(logDir, safeName)
            console.log(`Recording artifacts under recordings/${safeName}/`)
            console.log(`Connector logs saved to: ${logFile}`)
            process.exit(code ?? 0)
        }, 300)
    })

    child.on('error', (err) => {
        console.error(`Failed to start connector: ${err.message}`)
        process.exit(1)
    })
})
