#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const changelogFiles = ['CHANGELOG.md', path.join('docs', 'CHANGELOG.md')]

function compareSemver(left, right) {
    const a = left.split('.').map((part) => Number(part))
    const b = right.split('.').map((part) => Number(part))
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) {
            return a[index] > b[index] ? 1 : -1
        }
    }
    return 0
}

function changelogVersionsAbove(markdown, manifestVersion) {
    const violations = []
    const lines = markdown.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        if (!line.startsWith('## ') || !line.includes('· v')) {
            continue
        }
        const match = line.match(/^## \d{4}-\d{2}-\d{2} · v(\d+\.\d+\.\d+)$/)
        if (!match || compareSemver(match[1], manifestVersion) > 0) {
            violations.push({ line: index + 1, text: line })
        }
    }
    return violations
}

function checkChangelogVersions(files, manifestVersion) {
    const failures = []
    for (const file of files) {
        const markdown = fs.readFileSync(file.path, 'utf8')
        for (const violation of changelogVersionsAbove(markdown, manifestVersion)) {
            failures.push(`${file.label}:${violation.line}: ${violation.text}`)
        }
    }
    return failures
}

function main() {
    const { version } = require(path.join(rootDir, 'package.json'))
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        console.error(`changelog version check failed: package.json version "${version}" is not X.Y.Z`)
        process.exit(1)
    }

    const files = changelogFiles
        .map((label) => ({
            label,
            path: path.join(rootDir, label),
        }))
        .filter((file) => file.label === 'CHANGELOG.md' || fs.existsSync(file.path))
    const failures = checkChangelogVersions(files, version)
    if (failures.length) {
        console.error(
            `changelog version check failed: a heading is above package.json version ${version}. ` +
                'The changelog stays on the current version until that version is released.'
        )
        for (const failure of failures) {
            console.error(`  - ${failure}`)
        }
        process.exit(1)
    }

    console.log(`changelog version check passed (${version}).`)
}

if (require.main === module) {
    main()
}

module.exports = { changelogVersionsAbove, compareSemver }
