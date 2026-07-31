#!/usr/bin/env node
const { parseOrchestratorArgv, runScenarioReplay } = require('./lib/scenario-replay-lib.cjs')

async function main() {
    let parsed
    try {
        parsed = parseOrchestratorArgv(process.argv)
    } catch (err) {
        console.error(`ERROR: ${err.message}`)
        process.exit(1)
    }

    const { flags, scenarioRef } = parsed
    if (!scenarioRef) {
        console.error('ERROR: scenario reference is required (tenant/scenario)')
        console.error('Usage: node scripts/scenario-replay-orchestrator.cjs <tenant/scenario> [--no-verify] [--step <id>] [--pause-on-fail]')
        process.exit(1)
    }

    console.log('Identity Fusion NG — Scenario Replay Orchestrator')
    console.log('=================================================')
    console.log(`Scenario: ${scenarioRef}`)
    if (flags.noVerify) console.log('Verify: disabled (--no-verify)')
    if (flags.step) console.log(`Step filter: ${flags.step}`)
    if (flags.pauseOnFail) console.log('Pause on fail: enabled')
    console.log('')

    try {
        const { failed } = await runScenarioReplay({ scenarioRef, flags })
        process.exit(failed ? 1 : 0)
    } catch (err) {
        console.error(`ERROR: ${err.message}`)
        process.exit(1)
    }
}

main()
