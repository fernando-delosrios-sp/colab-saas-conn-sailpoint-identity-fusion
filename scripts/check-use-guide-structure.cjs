#!/usr/bin/env node

/**
 * Guards use-guide IA: one topic per page, routers link out, no embedded mini-guides.
 * Run via: npm run lint:docs-guides
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const useGuidesDir = path.join(rootDir, 'docs', 'use-guides')

/** H2 titles allowed to repeat across multiple use guides (section boilerplate). */
const ALLOWED_DUPLICATE_H2 = new Set([
    'Related guides',
    'Related resources',
    'When you need this',
    'Troubleshooting',
    'Prerequisites',
    'Overview',
    'Before you start',
    'Choose your path',
    'By topic',
    'Getting more help',
    'Symptom index',
    'Goals',
    'Reading order',
    'Common deployment patterns',
    'Combined match score',
])

/**
 * Section headings owned by a single canonical file (relative to docs/use-guides/).
 * Other guides must link to the owner instead of embedding the workflow.
 */
const OWNED_SECTIONS = [
    {
        title: 'Non-persistent analysis with dry-run mode',
        owner: 'operation/analyze-with-dry-run.md',
    },
    {
        title: 'Workflow: run a dry-run',
        owner: 'operation/analyze-with-dry-run.md',
    },
    {
        title: 'Workflow: tie-in to Match tuning',
        owner: 'operation/analyze-with-dry-run.md',
    },
    {
        title: 'Workflow: capture a scenario',
        owner: 'operation/capture-scenarios-for-replay.md',
    },
    {
        title: 'Workflow: replay and verify',
        owner: 'operation/capture-scenarios-for-replay.md',
    },
    {
        title: 'Localization and reviewer experience',
        owner: 'configuration/managing-reviewers.md',
    },
    {
        title: 'Global reviewers (simple setup)',
        owner: 'configuration/managing-reviewers.md',
    },
    {
        title: 'Per-source reviewers (fine-grained control)',
        owner: 'configuration/managing-reviewers.md',
    },
    {
        title: 'Owners as global reviewers',
        owner: 'configuration/managing-reviewers.md',
    },
    {
        title: 'Enforced correlation role',
        owner: 'configuration/managing-correlation.md',
    },
]

function normalizeHeading(line) {
    const match = line.match(/^#{2,3}\s+(.+?)\s*(?:\{#.*\})?\s*$/)
    return match ? match[1].trim() : null
}

function listMarkdownFiles(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            listMarkdownFiles(fullPath, files)
        } else if (entry.name.endsWith('.md') && entry.name !== 'index.md') {
            files.push(fullPath)
        }
    }
    return files
}

function relativeUseGuidePath(absPath) {
    return path.relative(useGuidesDir, absPath).split(path.sep).join('/')
}

function checkDuplicateH2(files) {
    const byTitle = new Map()

    for (const file of files) {
        const rel = relativeUseGuidePath(file)
        const lines = fs.readFileSync(file, 'utf8').split('\n')
        for (const line of lines) {
            if (!line.startsWith('## ')) continue
            const title = normalizeHeading(line)
            if (!title) continue
            if (!byTitle.has(title)) byTitle.set(title, [])
            byTitle.get(title).push(rel)
        }
    }

    const violations = []
    for (const [title, paths] of byTitle.entries()) {
        if (paths.length < 2 || ALLOWED_DUPLICATE_H2.has(title)) continue
        violations.push({ title, paths })
    }
    return violations
}

function checkOwnedSections(files) {
    const violations = []

    for (const file of files) {
        const rel = relativeUseGuidePath(file)
        const lines = fs.readFileSync(file, 'utf8').split('\n')

        for (const line of lines) {
            const title = normalizeHeading(line)
            if (!title) continue

            const rule = OWNED_SECTIONS.find((entry) => entry.title.toLowerCase() === title.toLowerCase())
            if (!rule) continue

            const allowed = new Set([rule.owner, ...(rule.allowAlso ?? [])])
            if (!allowed.has(rel)) {
                violations.push({ title, file: rel, owner: rule.owner })
            }
        }
    }

    return violations
}

function main() {
    if (!fs.existsSync(useGuidesDir)) {
        console.error(`Missing ${useGuidesDir}`)
        process.exit(1)
    }

    const files = listMarkdownFiles(useGuidesDir)
    const duplicateH2 = checkDuplicateH2(files)
    const ownedSection = checkOwnedSections(files)
    let failed = false

    if (duplicateH2.length) {
        failed = true
        console.error('Duplicate H2 headings across use guides (link to one canonical page instead):')
        for (const { title, paths } of duplicateH2.sort((a, b) => a.title.localeCompare(b.title))) {
            console.error(`  - "${title}" in ${paths.join(', ')}`)
        }
    }

    if (ownedSection.length) {
        failed = true
        console.error('Embedded section owned by another guide:')
        for (const { title, file, owner } of ownedSection) {
            console.error(`  - "${title}" in ${file} (canonical: ${owner})`)
        }
    }

    if (failed) {
        console.error('\nSee AGENTS.md §Documentation and docs/use-guides/configuration/index.md.')
        process.exit(1)
    }

    console.log(`use-guide structure check passed (${files.length} guides).`)
}

main()
