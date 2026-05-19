#!/usr/bin/env node
const readline = require('readline')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

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
    const logDir = path.resolve('test-data', 'recordings', safeName)
    const logFile = path.join(logDir, 'connector.log')

    fs.mkdirSync(logDir, { recursive: true })

    const logStream = fs.createWriteStream(logFile, { flags: 'w' })

    console.log(`Recording to chain: ${safeName}`)
    console.log(`Logs will be saved to: ${logFile}`)
    console.log('Connector starting in record mode. Press Ctrl+C to stop and finalize.')
    console.log('')

    rl.close()

    const child = spawn('npx', ['spcx', 'run', 'dist/index.js'], {
        env: {
            ...process.env,
            RECORD_MODE: 'true',
            RECORD_CHAIN_NAME: safeName,
            VERBOSE_RECORDING: 'true',
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
        console.log(`Recording finalized — scenario saved to test-data/recordings/${safeName}/scenario.json`)
        console.log(`Connector logs saved to: ${logFile}`)
        process.exit(code ?? 0)
    })

    child.on('error', (err) => {
        console.error(`Failed to start connector: ${err.message}`)
        process.exit(1)
    })
})