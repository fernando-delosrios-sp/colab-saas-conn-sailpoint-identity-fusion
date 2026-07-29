#!/usr/bin/env node
const readline = require('readline')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { RECORDINGS_ROOT, chainDir } = require('./recording-paths.cjs')
const { finalizeChainArtifacts, countNdjsonLines } = require('./finalize-chain-artifacts.cjs')

function listAvailableChains() {
    if (!fs.existsSync(RECORDINGS_ROOT)) return []
    return fs
        .readdirSync(RECORDINGS_ROOT, { withFileTypes: true })
        .filter((d) => {
            if (!d.isDirectory()) return false
            const apiLog = path.join(RECORDINGS_ROOT, d.name, 'api-log.ndjson')
            return fs.existsSync(apiLog) && countNdjsonLines(apiLog) > 0
        })
        .map((d) => d.name)
        .sort()
}

function validateChain(chainName) {
    const safeName = chainName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
    const dir = chainDir(safeName)
    const scenarioPath = path.join(dir, 'scenario.json')
    const apiLogPath = path.join(dir, 'api-log.ndjson')
    const manifestPath = path.join(dir, 'manifest.json')

    if (!fs.existsSync(dir)) {
        console.error(`ERROR: chain directory not found: ${dir}`)
        console.error('Record this chain first: npm run record')
        process.exit(1)
    }

    if (!fs.existsSync(apiLogPath)) {
        console.error(`ERROR: api-log.ndjson not found at ${apiLogPath}`)
        console.error('Record this chain first: npm run record')
        process.exit(1)
    }

    const apiLogLines = countNdjsonLines(apiLogPath)
    if (apiLogLines === 0) {
        console.error('ERROR: api-log.ndjson is empty — nothing to replay')
        process.exit(1)
    }
    console.log(`api-log.ndjson: ${apiLogLines} entries`)

    if (!fs.existsSync(scenarioPath) && fs.existsSync(path.join(dir, 'steps.ndjson'))) {
        console.log('scenario.json missing — finalizing from steps.ndjson...')
        const result = finalizeChainArtifacts(safeName)
        console.log(`  wrote scenario.json (${result.stepCount} steps) and manifest.json`)
    } else if (!fs.existsSync(scenarioPath)) {
        console.warn('WARNING: scenario.json missing and no steps.ndjson to build from')
        console.warn('Chain replay tests will not work; live connector replay uses api-log only')
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

    return { dir, scenarioPath, safeName }
}

function startReplay(chainName) {
    const { dir, safeName } = validateChain(chainName)
    const logFile = path.join(dir, 'connector-replay.log')
    const logStream = fs.createWriteStream(logFile, { flags: 'w' })

    console.log('')
    console.log('Identity Fusion NG — Chain Replay')
    console.log('=================================')
    console.log(`Replaying chain: ${safeName}`)
    console.log(`Artifact directory: ${dir}`)
    console.log(`Connector log: ${logFile}`)
    console.log('Connector starting in replay mode. Press Ctrl+C to stop.')
    console.log('')

    const child = spawn('npx', ['spcx', 'run', 'dist/index.js'], {
        env: {
            ...process.env,
            REPLAY_MODE: 'true',
            RECORD_CHAIN_NAME: safeName,
            VERBOSE_RECORDING: process.env.VERBOSE_RECORDING ?? 'true',
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
        console.log(`Replay session ended — log saved to ${logFile}`)
        process.exit(code ?? 0)
    })

    child.on('error', (err) => {
        console.error(`Failed to start connector: ${err.message}`)
        process.exit(1)
    })
}

function promptChainName(available) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    if (available.length > 0) {
        console.log('Available chains (with api-log):')
        for (const name of available) {
            console.log(`  - ${name}`)
        }
        console.log('')
    }

    rl.question('Enter chain name to replay: ', (chainName) => {
        rl.close()
        const trimmed = (chainName || '').trim()
        if (!trimmed) {
            console.error('Chain name is required')
            process.exit(1)
        }
        startReplay(trimmed)
    })
}

const argChain = process.argv[2]?.trim()
if (argChain) {
    startReplay(argChain)
} else {
    promptChainName(listAvailableChains())
}
