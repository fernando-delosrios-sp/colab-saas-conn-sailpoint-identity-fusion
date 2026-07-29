#!/usr/bin/env node
const readline = require('readline')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

function countNdjsonLines(filePath) {
    if (!fs.existsSync(filePath)) return 0
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (!content) return 0
    return content.split('\n').filter(Boolean).length
}

console.log('Identity Fusion NG — Chain Test Recorder')
console.log('=========================================')
console.log('')

rl.question('Enter chain name: ', (chainName) => {
    const trimmed = (chainName || '').trim()
    if (!trimmed) {
        console.error('Chain name is required')
        process.exit(1)
    }

    const safeName = trimmed.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
    const logDir = path.resolve('test-data', 'recordings', safeName)
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
            // Deprecated: these env vars are kept for backward compat.
            // Prefer setting FusionConfig.recording.{mode,chainName,verbose} via readConfig bridge.
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

    const handleExit = () => {
        if (!child.killed) {
            child.kill('SIGINT')
        }
    }

    process.on('SIGINT', handleExit)
    process.on('SIGTERM', handleExit)

    child.on('exit', (code) => {
        logStream.end()
        console.log('')

        const manifestPath = path.join(logDir, 'manifest.json')
        const scenarioPath = path.join(logDir, 'scenario.json')
        const apiLogPath = path.join(logDir, 'api-log.ndjson')
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
                console.log(`manifest.json: store=${manifest.store}, steps=${manifest.stepCount}, api-log=${manifest.apiLogEntryCount}`)
            } catch {
                console.warn('WARNING: manifest.json could not be parsed')
            }
        }

        console.log(`Recording finalized — artifacts under test-data/recordings/${safeName}/`)
        console.log(`Connector logs saved to: ${logFile}`)
        process.exit(code ?? 0)
    })

    child.on('error', (err) => {
        console.error(`Failed to start connector: ${err.message}`)
        process.exit(1)
    })
})
