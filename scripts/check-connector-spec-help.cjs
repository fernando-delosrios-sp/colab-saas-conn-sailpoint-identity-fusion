#!/usr/bin/env node

/**
 * Validates connector-spec.json helpKey and sectionHelpMessage length/link rules.
 *
 * Usage:
 *   node scripts/check-connector-spec-help.cjs          # exit 1 on violations
 *   node scripts/check-connector-spec-help.cjs --audit  # print violations, exit 0
 */

const fs = require('fs')
const path = require('path')
const { collectViolations, HELP_KEY_MAX, SECTION_HELP_MAX } = require('./connector-spec-help-lib.cjs')

const rootDir = path.resolve(__dirname, '..')
const specPath = path.join(rootDir, 'connector-spec.json')
const auditMode = process.argv.includes('--audit')

function main() {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
    const violations = collectViolations(spec)

    if (violations.length === 0) {
        console.log('connector-spec inline help: OK')
        process.exit(0)
    }

    console.error(`connector-spec inline help: ${violations.length} violation(s)`)
    for (const v of violations) {
        console.error(`  [${v.kind}] ${v.id}: ${v.message}`)
    }

    if (auditMode) {
        console.error(
            `\nLimits: helpKey ≤${HELP_KEY_MAX} chars, plain text, 1 sentence; sectionHelpMessage ≤${SECTION_HELP_MAX} chars HTML overview; sections require docLink + docLinkLabel (no markdown in help strings)`
        )
        process.exit(0)
    }

    process.exit(1)
}

main()
