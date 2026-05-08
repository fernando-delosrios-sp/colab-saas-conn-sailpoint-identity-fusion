#!/usr/bin/env node
const readline = require('readline')
const { spawn } = require('child_process')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

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
    console.log(`Recording to chain: ${safeName}`)
    console.log('Connector starting in record mode. Press Ctrl+C to stop and finalize.')
    console.log('')

    rl.close()

    const child = spawn('npx', ['spcx', 'run', 'dist/index.js'], {
        env: {
            ...process.env,
            RECORD_MODE: 'true',
            RECORD_CHAIN_NAME: safeName,
        },
        stdio: 'inherit',
    })

    const handleExit = () => {
        if (!child.killed) {
            child.kill('SIGINT')
        }
    }

    process.on('SIGINT', handleExit)
    process.on('SIGTERM', handleExit)

    child.on('exit', (code) => {
        console.log('')
        console.log(
            `Recording finalized — scenario saved to test-data/recordings/${safeName}/scenario.json`
        )
        process.exit(code ?? 0)
    })

    child.on('error', (err) => {
        console.error(`Failed to start connector: ${err.message}`)
        process.exit(1)
    })
})
