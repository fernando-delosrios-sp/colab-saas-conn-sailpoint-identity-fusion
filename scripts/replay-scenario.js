#!/usr/bin/env node
const readline = require('readline')
const { spawnSync } = require('child_process')
const path = require('path')
const {
    listScenariosWithApiLog,
    resolveScenarioRefFromArgv,
} = require('./recording-paths.cjs')

function parseReplayArgv(argv) {
    const orchestratorArgs = [path.join(__dirname, 'scenario-replay-orchestrator.cjs')]
    const passthrough = []

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--no-verify' || arg === '--pause-on-fail' || arg === '--step' || arg === '--port') {
            orchestratorArgs.push(arg)
            if (arg === '--step' || arg === '--port') {
                orchestratorArgs.push(argv[++i])
            }
        } else if (arg.startsWith('--')) {
            console.error(`Unknown flag: ${arg}`)
            process.exit(1)
        } else {
            passthrough.push(arg)
        }
    }

    const scenarioRef = resolveScenarioRefFromArgv(['node', 'replay-scenario', ...passthrough])
    return { orchestratorArgs, scenarioRef }
}

function delegateToOrchestrator(scenarioRef, orchestratorArgs) {
    const args = [...orchestratorArgs]
    if (scenarioRef) {
        args.push(scenarioRef)
    }

    const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
    process.exit(result.status ?? 1)
}

function promptScenarioRef(available) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    if (available.length > 0) {
        console.log('Available scenarios (with api-log):')
        for (const name of available) {
            console.log(`  - ${name}`)
        }
        console.log('')
    }

    rl.question('Enter scenario reference to replay (tenant/scenario): ', (scenarioInput) => {
        rl.close()
        const trimmed = (scenarioInput || '').trim()
        if (!trimmed) {
            console.error('Scenario reference is required (tenant/scenario)')
            process.exit(1)
        }
        delegateToOrchestrator(trimmed, [path.join(__dirname, 'scenario-replay-orchestrator.cjs')])
    })
}

const { orchestratorArgs, scenarioRef } = parseReplayArgv(process.argv)

if (scenarioRef) {
    delegateToOrchestrator(scenarioRef, orchestratorArgs)
} else {
    promptScenarioRef(listScenariosWithApiLog())
}
