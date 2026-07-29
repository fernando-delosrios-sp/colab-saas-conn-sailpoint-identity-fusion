#!/usr/bin/env node
const readline = require('readline')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { RECORDINGS_ROOT, chainDir } = require('./recording-paths.cjs')
const { finalizeChainArtifacts } = require('./finalize-chain-artifacts.cjs')

function listAvailableChains() {
    if (!fs.existsSync(RECORDINGS_ROOT)) return []
    return fs
        .readdirSync(RECORDINGS_ROOT, { withFileTypes: true })
        .filter((d) => {
            if (!d.isDirectory()) return false
            const scenario = path.join(RECORDINGS_ROOT, d.name, 'scenario.json')
            const steps = path.join(RECORDINGS_ROOT, d.name, 'steps.ndjson')
            return fs.existsSync(scenario) || fs.existsSync(steps)
        })
        .map((d) => d.name)
        .sort()
}

function validateChain(chainName) {
    const safeName = chainName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
    const dir = chainDir(safeName)
    const scenarioPath = path.join(dir, 'scenario.json')
    const stepsPath = path.join(dir, 'steps.ndjson')

    if (!fs.existsSync(dir)) {
        console.error(`ERROR: chain directory not found: ${dir}`)
        console.error('Record this chain first: npm run record')
        process.exit(1)
    }

    if (!fs.existsSync(scenarioPath) && fs.existsSync(stepsPath)) {
        console.log('scenario.json missing — finalizing from steps.ndjson...')
        const result = finalizeChainArtifacts(safeName)
        console.log(`  wrote scenario.json (${result.stepCount} steps) and manifest.json`)
    } else if (!fs.existsSync(scenarioPath)) {
        console.error(`ERROR: scenario.json not found at ${scenarioPath}`)
        console.error('Record this chain first: npm run record')
        process.exit(1)
    }

    return safeName
}

function runVerification(chainName) {
    const safeName = validateChain(chainName)

    console.log('')
    console.log('Identity Fusion NG — Test Recording')
    console.log('===================================')
    console.log(`Verifying chain: ${safeName}`)
    console.log(`Artifact directory: ${chainDir(safeName)}`)
    console.log('')
    console.log('Usage: npm run test-recording -- <chainName>')
    console.log('')

    const result = spawnSync(
        'npx',
        ['vitest', 'run', 'src/operations/__tests__/chain/verifyRecording.cli.test.ts'],
        {
            env: {
                ...process.env,
                VERIFY_RECORDING_CHAIN: safeName,
            },
            stdio: 'inherit',
        }
    )

    process.exit(result.status ?? 1)
}

function promptChainName(available) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    if (available.length > 0) {
        console.log('Available chains (with scenario or steps):')
        for (const name of available) {
            console.log(`  - ${name}`)
        }
        console.log('')
    }

    rl.question('Enter chain name to verify: ', (chainName) => {
        rl.close()
        const trimmed = (chainName || '').trim()
        if (!trimmed) {
            console.error('Chain name is required')
            console.error('Usage: npm run test-recording -- <chainName>')
            process.exit(1)
        }
        runVerification(trimmed)
    })
}

const argChain = process.argv[2]?.trim()
if (argChain) {
    runVerification(argChain)
} else {
    promptChainName(listAvailableChains())
}
