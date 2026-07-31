#!/usr/bin/env node
const readline = require('readline')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const {
    scenarioDir,
    parseRecordingScenarioRef,
    listTenantScenarioDirs,
    resolveScenarioRefFromArgv,
    resolveChainRefFromArgv,
} = require('./recording-paths.cjs')
const { finalizeChainArtifacts } = require('./finalize-chain-artifacts.cjs')

function resolveScenarioRefFromArgvCompat(argv) {
    return resolveScenarioRefFromArgv(argv) || resolveChainRefFromArgv(argv)
}

function listAvailableScenarios() {
    return listTenantScenarioDirs()
        .map((entry) => entry.scenarioRef)
        .sort()
}

function validateScenario(scenarioRefInput) {
    const { scenarioRef } = parseRecordingScenarioRef(scenarioRefInput)
    const dir = scenarioDir(scenarioRef)
    const scenarioPath = path.join(dir, 'scenario.json')
    const stepsPath = path.join(dir, 'steps.ndjson')

    if (!fs.existsSync(dir)) {
        console.error(`ERROR: scenario directory not found: ${dir}`)
        console.error('Capture this scenario first via External Settings or npm run record')
        process.exit(1)
    }

    if (!fs.existsSync(scenarioPath) && fs.existsSync(stepsPath)) {
        console.log('scenario.json missing — finalizing from steps.ndjson...')
        const result = finalizeChainArtifacts(scenarioRef)
        console.log(`  wrote scenario.json (${result.stepCount} steps) and manifest.json`)
    } else if (!fs.existsSync(scenarioPath)) {
        console.error(`ERROR: scenario.json not found at ${scenarioPath}`)
        console.error('Capture this scenario first via External Settings or npm run record')
        process.exit(1)
    }

    return scenarioRef
}

function runVerification(scenarioRefInput) {
    const scenarioRef = validateScenario(scenarioRefInput)

    console.log('')
    console.log('Identity Fusion NG — Test Recording')
    console.log('===================================')
    console.log(`Verifying scenario: ${scenarioRef}`)
    console.log(`Artifact directory: ${scenarioDir(scenarioRef)}`)
    console.log('')
    console.log('Usage: npm run test-recording -- <tenant/scenario>')
    console.log('')

    const verifyEnv = { ...process.env, VERIFY_RECORDING_SCENARIO: scenarioRef }
    if (process.env.VERIFY_RECORDING_CHAIN && !process.env.VERIFY_RECORDING_SCENARIO) {
        console.warn('VERIFY_RECORDING_CHAIN is deprecated; use VERIFY_RECORDING_SCENARIO')
    }

    const result = spawnSync(
        'npx',
        ['vitest', 'run', 'src/operations/__tests__/scenario/verifyRecording.cli.test.ts'],
        {
            env: verifyEnv,
            stdio: 'inherit',
        }
    )

    process.exit(result.status ?? 1)
}

function promptScenarioRef(available) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    if (available.length > 0) {
        console.log('Available scenarios (with scenario or steps):')
        for (const name of available) {
            console.log(`  - ${name}`)
        }
        console.log('')
    }

    rl.question('Enter scenario reference to verify (tenant/scenario): ', (scenarioInput) => {
        rl.close()
        const trimmed = (scenarioInput || '').trim()
        if (!trimmed) {
            console.error('Scenario reference is required (tenant/scenario)')
            console.error('Usage: npm run test-recording -- <tenant/scenario>')
            process.exit(1)
        }
        runVerification(trimmed)
    })
}

const argScenario = resolveScenarioRefFromArgvCompat(process.argv)
if (argScenario) {
    runVerification(argScenario)
} else {
    promptScenarioRef(listAvailableScenarios())
}
