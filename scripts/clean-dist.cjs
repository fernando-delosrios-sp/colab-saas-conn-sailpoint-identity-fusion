#!/usr/bin/env node
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const distPath = path.join(repoRoot, 'dist')

const DEV_PROCESS_MARKERS = [
    'spcx run dist/index.js',
    'tsc --inlineSourcemap',
    'scripts/debug-messages.cjs',
]

function findBlockingDevProcesses() {
    let psOutput
    try {
        psOutput = execSync('ps aux', { encoding: 'utf8' })
    } catch {
        return []
    }

    return psOutput
        .split('\n')
        .filter((line) => line.includes(repoRoot))
        .filter((line) => DEV_PROCESS_MARKERS.some((marker) => line.includes(marker)))
        .map((line) => line.trim().replace(/\s+/g, ' '))
}

function sleep(ms) {
    const end = Date.now() + ms
    while (Date.now() < end) {
        // spin
    }
}

function removeDist(maxAttempts = 5) {
    if (!fs.existsSync(distPath)) {
        return
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            fs.rmSync(distPath, { recursive: true, force: true })
            return
        } catch (err) {
            if (attempt === maxAttempts) {
                throw err
            }
            sleep(200)
        }
    }
}

const blockers = findBlockingDevProcesses()
if (blockers.length > 0) {
    console.error('Cannot clean dist/ while connector dev processes are running:')
    for (const line of blockers) {
        console.error(`  ${line}`)
    }
    console.error('')
    console.error('Stop dev processes first (Ctrl+C in those terminals), for example:')
    console.error('  npm run debug:messages')
    console.error('  npm run debug / dev / proxy / record / replay')
    process.exit(1)
}

try {
    removeDist()
} catch (err) {
    console.error(`Failed to remove dist/: ${err.message}`)
    console.error('If a dev server is running, stop it and retry.')
    process.exit(1)
}

