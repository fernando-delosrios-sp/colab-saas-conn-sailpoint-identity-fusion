#!/usr/bin/env node
const readline = require('readline')
const fs = require('fs')
const path = require('path')
const { chainDir, parseRecordingChainRef, listChainsWithApiLog, resolveChainRefFromArgv } = require('./recording-paths.cjs')
const { finalizeChainArtifacts, countNdjsonLines } = require('./finalize-chain-artifacts.cjs')

function runFinalize(chainRefInput) {
    const { chainRef } = parseRecordingChainRef(chainRefInput)
    const dir = chainDir(chainRef)
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

    const result = finalizeChainArtifacts(chainRef)
    console.log(`Finalized ${chainRef}: ${result.stepCount} steps, ${result.apiLogEntryCount} api-log entries`)
    console.log(`  scenario: ${result.scenarioPath}`)
    console.log(`  manifest: ${result.manifestPath}`)
}

function promptChainRef(available) {
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

    rl.question('Enter chain reference to finalize (tenant/chain): ', (chainInput) => {
        rl.close()
        const trimmed = (chainInput || '').trim()
        if (!trimmed) {
            console.error('Chain reference is required (tenant/chain)')
            process.exit(1)
        }
        runFinalize(trimmed)
    })
}

const argChain = resolveChainRefFromArgv(process.argv)
if (argChain) {
    runFinalize(argChain)
} else {
    promptChainRef(listChainsWithApiLog())
}
