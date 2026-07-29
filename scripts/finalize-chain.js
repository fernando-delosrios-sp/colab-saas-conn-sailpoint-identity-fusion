#!/usr/bin/env node
const readline = require('readline')
const fs = require('fs')
const path = require('path')
const { RECORDINGS_ROOT, chainDir } = require('./recording-paths.cjs')
const { finalizeChainArtifacts, countNdjsonLines } = require('./finalize-chain-artifacts.cjs')

function listChainsWithApiLog() {
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

function runFinalize(chainName) {
    const safeName = chainName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
    const dir = chainDir(safeName)
    const apiLogPath = path.join(dir, 'api-log.ndjson')

    if (!fs.existsSync(dir)) {
        console.error(`ERROR: chain directory not found: ${dir}`)
        process.exit(1)
    }
    if (!fs.existsSync(path.join(dir, 'steps.ndjson'))) {
        console.error(`ERROR: steps.ndjson not found in ${dir}`)
        process.exit(1)
    }

    const apiLines = countNdjsonLines(apiLogPath)
    if (apiLines === 0) {
        console.warn(`WARNING: api-log.ndjson missing or empty at ${apiLogPath}`)
    }

    const result = finalizeChainArtifacts(safeName)
    console.log(`Finalized chain "${safeName}":`)
    console.log(`  steps: ${result.stepCount}`)
    console.log(`  api-log entries: ${result.apiLogEntryCount}`)
    console.log(`  scenario: ${result.scenarioPath}`)
    console.log(`  manifest: ${result.manifestPath}`)
}

function prompt(chainNames) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    if (chainNames.length > 0) {
        console.log('Chains with api-log:')
        for (const name of chainNames) console.log(`  - ${name}`)
        console.log('')
    }
    rl.question('Enter chain name to finalize: ', (name) => {
        rl.close()
        const trimmed = (name || '').trim()
        if (!trimmed) {
            console.error('Chain name is required')
            process.exit(1)
        }
        runFinalize(trimmed)
    })
}

const arg = process.argv[2]?.trim()
if (arg) {
    runFinalize(arg)
} else {
    prompt(listChainsWithApiLog())
}
