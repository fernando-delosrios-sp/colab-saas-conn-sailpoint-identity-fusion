#!/usr/bin/env node

const { execSync } = require('node:child_process')
const { readFileSync } = require('node:fs')

function run(command) {
    return execSync(command, { encoding: 'utf8' }).trim()
}

function fail(message) {
    console.error(`README changelog check failed: ${message}`)
    process.exit(1)
}

function requiresChangelogEntry(file) {
    return (
        file === 'README.md' ||
        file.startsWith('src/') ||
        file.startsWith('docs/') ||
        file === 'mkdocs.yml' ||
        file === 'tsconfig.json' ||
        file === 'package.json' ||
        file === 'package-lock.json'
    )
}

const readme = readFileSync('README.md', 'utf8')
if (!/^##\s+Changelog\s*$/m.test(readme)) {
    fail('README.md must include a "## Changelog" section.')
}

const baseRef = process.env.GITHUB_BASE_REF || 'main'

try {
    run(`git rev-parse --verify origin/${baseRef}`)
} catch {
    run(`git fetch --no-tags origin ${baseRef}`)
}

let changedFiles = run(`git diff --name-only origin/${baseRef}...HEAD`).split('\n').filter(Boolean)
if (!changedFiles.length) {
    changedFiles = run('git diff --name-only').split('\n').filter(Boolean)
}

if (!changedFiles.some(requiresChangelogEntry)) {
    console.log('No product/docs files changed; skipping README changelog requirement.')
    process.exit(0)
}

if (!changedFiles.includes('README.md')) {
    fail('README.md must be updated when product/docs files change and include a changelog entry.')
}

let patch = run(`git diff --unified=0 origin/${baseRef}...HEAD -- README.md`)
if (!patch) {
    patch = run('git diff --unified=0 -- README.md')
}
const lines = patch.split('\n')

let changelogTouched = false
let inChangelogSection = false

for (const line of lines) {
    if (line.startsWith('@@')) {
        continue
    }
    if (line.startsWith('+## ') || line.startsWith('-## ') || line.startsWith(' ## ')) {
        const heading = line.slice(1).trim()
        inChangelogSection = /^##\s+Changelog\s*$/i.test(heading)
        continue
    }
    if (inChangelogSection && (line.startsWith('+') || line.startsWith('-'))) {
        const text = line.slice(1).trim()
        if (text && !text.startsWith('## ')) {
            changelogTouched = true
            break
        }
    }
}

if (!changelogTouched) {
    fail('PR must change content inside the "## Changelog" section in README.md.')
}

console.log('README changelog check passed.')
