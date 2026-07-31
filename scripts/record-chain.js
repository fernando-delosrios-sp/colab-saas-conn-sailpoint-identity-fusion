#!/usr/bin/env node
console.warn('[deprecated] scripts/record-chain.js — use scripts/record-scenario.js (npm run record)')
const { spawnSync } = require('child_process')
const path = require('path')

const result = spawnSync(process.execPath, [path.join(__dirname, 'record-scenario.js'), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
})
process.exit(result.status ?? 1)
