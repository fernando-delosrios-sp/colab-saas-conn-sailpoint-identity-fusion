#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { spawn } = require('child_process')

const LOG_FILE =
    process.env.LOG_FILE ||
    path.join('logs', `debug-messages-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`)
const LOG_PATH = path.resolve(LOG_FILE)

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' })

let messageCount = 0

console.error(`Writing messages to ${LOG_PATH}`)

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

/** Write an extracted message to stdout and the log file. */
function logMessage(message) {
    console.log(message)
    logStream.write(`${message}\n`)
    messageCount++
}

/** Attach JSON-aware line logging to a readline interface. */
function attachLineReader(rl) {
    rl.on('line', (line) => {
        const message = messageFromLine(line)
        if (message) {
            logMessage(message)
        }
    })
}

const child = spawn('spcx', ['run', 'dist/index.js'], {
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
})

attachLineReader(readline.createInterface({ input: child.stdout }))
attachLineReader(readline.createInterface({ input: child.stderr }))

let shuttingDown = false

const forwardSignal = (signal) => {
    if (!child.killed) {
        child.kill(signal)
    }
}

const finish = (code) => {
    logStream.end(() => {
        console.error(`Saved ${messageCount} message(s) to ${LOG_PATH}`)
        process.exit(code)
    })
}

process.on('SIGINT', () => {
    if (shuttingDown) return
    shuttingDown = true
    forwardSignal('SIGINT')
})
process.on('SIGTERM', () => {
    if (shuttingDown) return
    shuttingDown = true
    forwardSignal('SIGTERM')
})

child.on('error', (err) => {
    console.error(`Failed to start connector: ${err.message}`)
    finish(1)
})

child.on('exit', (code, signal) => {
    finish(signal ? 128 + (signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 1) : (code ?? 0))
})

