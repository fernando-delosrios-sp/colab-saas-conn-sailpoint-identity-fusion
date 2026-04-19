/**
 * Writes connector-spec.json → sourceConfigInitialValues from src/data/connectorSpecInitialValues.json
 * so the spec stays aligned with the single source of truth at build time.
 */
const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..')
const specPath = path.join(repoRoot, 'connector-spec.json')
const initialPath = path.join(repoRoot, 'src', 'data', 'connectorSpecInitialValues.json')

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const initial = JSON.parse(fs.readFileSync(initialPath, 'utf8'))

spec.sourceConfigInitialValues = initial
fs.writeFileSync(specPath, JSON.stringify(spec, null, 4) + '\n', 'utf8')
