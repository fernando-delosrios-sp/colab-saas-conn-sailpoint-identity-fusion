#!/usr/bin/env node

const { execSync } = require('node:child_process')

function run(command) {
    return execSync(command, { encoding: 'utf8' }).trim()
}

const baseRef = process.env.GITHUB_BASE_REF || 'main'

try {
    run(`git rev-parse --verify origin/${baseRef}`)
} catch {
    run(`git fetch --no-tags origin ${baseRef}`)
}

const changed = run(`git diff --name-only origin/${baseRef}...HEAD`)
    .split('\n')
    .filter((file) => file && (file === 'README.md' || file.startsWith('docs/')))

if (!changed.length) {
    console.log('No README/docs files changed in this PR.')
    process.exit(0)
}

console.log('README/docs files changed:')
for (const file of changed) {
    console.log(`- ${file}`)
}
