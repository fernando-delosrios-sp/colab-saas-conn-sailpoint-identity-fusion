#!/usr/bin/env node
const { spawnSync } = require('child_process')
const {
    resolveScenarioRefFromArgv,
    resolveChainRefFromArgv,
    scenarioDir,
    parseRecordingScenarioRef,
} = require('./recording-paths.cjs')
const fs = require('fs')

function resolveScenarioRefFromArgvCompat(argv) {
    return resolveScenarioRefFromArgv(argv) || resolveChainRefFromArgv(argv)
}

function runRefresh(scenarioRefInput) {
    const { scenarioRef } = parseRecordingScenarioRef(scenarioRefInput)
    const dir = scenarioDir(scenarioRef)
    if (!fs.existsSync(dir)) {
        console.error(`ERROR: scenario directory not found: ${dir}`)
        process.exit(1)
    }

    console.log('')
    console.log('Identity Fusion NG — Refresh Scenario Reports')
    console.log('============================================')
    console.log(`Scenario: ${scenarioRef}`)
    console.log(`Artifact directory: ${dir}`)
    console.log('')

    const result = spawnSync(
        'npx',
        [
            'vitest',
            'run',
            '--config',
            'vitest.scenario.config.ts',
            'src/operations/__tests__/scenario/refreshRecordingReports.test.ts',
        ],
        {
            env: { ...process.env, REFRESH_RECORDING_SCENARIO: scenarioRef },
            stdio: 'inherit',
        }
    )

    process.exit(result.status ?? 1)
}

const argScenario = resolveScenarioRefFromArgvCompat(process.argv)
if (!argScenario) {
    console.error('Usage: npm run refresh-recording-reports -- <tenant/scenario>')
    process.exit(1)
}

runRefresh(argScenario)
