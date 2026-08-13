#!/usr/bin/env node

/**
 * Rewrites connector-spec.json helpKey and sectionHelpMessage to slim blurbs with doc links.
 */

const fs = require('fs')
const path = require('path')
const { slimSpec } = require('./connector-spec-help-lib.cjs')

const rootDir = path.resolve(__dirname, '..')
const specPath = path.join(rootDir, 'connector-spec.json')

function main() {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
    slimSpec(spec)
    fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 4)}\n`)
    console.log('Slimmed connector-spec.json helpKey and sectionHelpMessage strings.')
}

main()
