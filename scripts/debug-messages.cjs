#!/usr/bin/env node
const readline = require('readline')
const { spawn } = require('child_process')

/** Extract a log message from a connector stdout/stderr line. */
function messageFromLine(line) {
    const trimmed = line.trim()
    if (!trimmed) return ''

    try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed.message === 'string') {
            return parsed.message
        }
    } catch {
        // Not JSON — pass through unchanged.
    }

    return trimmed
}

/** Attach JSON-aware line logging to a readline interface. */
function attachLineReader(rl) {
    rl.on('line', (line) => {
        const message = messageFromLine(line)
        if (message) {
            console.log(message)
        }
    })
}

const child = spawn('spcx', ['run', 'dist/index.js'], {
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
})

attachLineReader(readline.createInterface({ input: child.stdout }))
attachLineReader(readline.createInterface({ input: child.stderr }))

const forwardSignal = (signal) => {
    if (!child.killed) {
        child.kill(signal)
    }
}

process.on('SIGINT', () => forwardSignal('SIGINT'))
process.on('SIGTERM', () => forwardSignal('SIGTERM'))

child.on('error', (err) => {
    console.error(`Failed to start connector: ${err.message}`)
    process.exit(1)
})

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal)
        return
    }
    process.exit(code ?? 0)
})
