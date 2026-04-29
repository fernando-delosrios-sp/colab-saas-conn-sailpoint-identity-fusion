#!/usr/bin/env node

const { execSync, spawnSync } = require('node:child_process')

function run(command) {
    return execSync(command, { encoding: 'utf8' }).trim()
}

const baseRef = process.env.GITHUB_BASE_REF || 'main'

try {
    run(`git rev-parse --verify origin/${baseRef}`)
} catch {
    run(`git fetch --no-tags origin ${baseRef}`)
}

const fromBase = run(`git diff --name-only origin/${baseRef}...HEAD`)
let changedFiles = fromBase
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => /^src\/.*\.(ts|js|mjs|cjs)$/.test(file))

if (!changedFiles.length) {
    changedFiles = run('git diff --name-only')
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean)
        .filter((file) => /^src\/.*\.(ts|js|mjs|cjs)$/.test(file))
}

if (!changedFiles.length) {
    console.log('No changed source files to lint.')
    process.exit(0)
}

console.log('Linting changed source files:')
for (const file of changedFiles) {
    console.log(`- ${file}`)
}

const eslint = spawnSync('npx', ['eslint', ...changedFiles], { stdio: 'inherit' })
process.exit(eslint.status ?? 1)
