#!/usr/bin/env node
console.warn('[deprecated] scripts/replay-chain.js — use scripts/replay-scenario.js (npm run replay)')
const { spawnSync } = require('child_process')
const path = require('path')

const result = spawnSync(process.execPath, [path.join(__dirname, 'replay-scenario.js'), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
})
process.exit(result.status ?? 1)
