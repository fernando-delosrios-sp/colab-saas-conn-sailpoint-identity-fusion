#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const docsDir = path.join(rootDir, 'docs')
const pattern = /lean-ctx:\s*omitted/

function walk(dir, hits) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(fullPath, hits)
            continue
        }
        if (!entry.name.endsWith('.md')) {
            continue
        }
        const content = fs.readFileSync(fullPath, 'utf8')
        if (pattern.test(content)) {
            hits.push(path.relative(rootDir, fullPath))
        }
    }
}

const hits = []
walk(docsDir, hits)

if (hits.length) {
    console.error('lean-ctx placeholder corruption detected under docs/:')
    for (const file of hits) {
        console.error(`  - ${file}`)
    }
    process.exit(1)
}

console.log('lean-ctx docs check passed.')
