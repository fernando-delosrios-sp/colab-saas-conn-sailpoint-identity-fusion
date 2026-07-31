#!/usr/bin/env node
const readline = require('readline')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { chainDir, parseRecordingChainRef, listTenantChainDirs, resolveChainRefFromArgv } = require('./recording-paths.cjs')
const { finalizeChainArtifacts } = require('./finalize-chain-artifacts.cjs')

function listAvailableChains() {
    return listTenantChainDirs()
        .map((entry) => entry.chainRef)
        .sort()
}

function validateChain(chainRefInput) {
    const { chainRef } = parseRecordingChainRef(chainRefInput)
    const dir = chainDir(chainRef)
    const scenarioPath = path.join(dir, 'scenario.json')
    const stepsPath = path.join(dir, 'steps.ndjson')

    if (!fs.existsSync(dir)) {
        console.error(`ERROR: chain directory not found: ${dir}`)
        console.error('Record this chain first: npm run record')
        process.exit(1)
    }

    if (!fs.existsSync(scenarioPath) && fs.existsSync(stepsPath)) {
        console.log('scenario.json missing — finalizing from steps.ndjson...')
        const result = finalizeChainArtifacts(chainRef)
        console.log(`  wrote scenario.json (${result.stepCount} steps) and manifest.json`)
    } else if (!fs.existsSync(scenarioPath)) {
        console.error(`ERROR: scenario.json not found at ${scenarioPath}`)
        console.error('Record this chain first: npm run record')
        process.exit(1)
    }

    return chainRef
}

function runVerification(chainRefInput) {
    const chainRef = validateChain(chainRefInput)

    console.log('')
    console.log('Identity Fusion NG — Test Recording')
    console.log('===================================')
    console.log(`Verifying chain: ${chainRef}`)
    console.log(`Artifact directory: ${chainDir(chainRef)}`)
    console.log('')
    console.log('Usage: npm run test-recording -- <tenant/chain>')
    console.log('')

    const result = spawnSync(
        'npx',
        ['vitest', 'run', 'src/operations/__tests__/chain/verifyRecording.cli.test.ts'],
        {
            env: {
                ...process.env,
                VERIFY_RECORDING_CHAIN: chainRef,
            },
            stdio: 'inherit',
        }
    )

    process.exit(result.status ?? 1)
}

function promptChainRef(available) {
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

    rl.question('Enter chain reference to verify (tenant/chain): ', (chainInput) => {
        rl.close()
        const trimmed = (chainInput || '').trim()
        if (!trimmed) {
            console.error('Chain reference is required (tenant/chain)')
            console.error('Usage: npm run test-recording -- <tenant/chain>')
            process.exit(1)
        }
        runVerification(trimmed)
    })
}

const argChain = resolveChainRefFromArgv(process.argv)
if (argChain) {
    runVerification(argChain)
} else {
    promptChainRef(listAvailableChains())
}
