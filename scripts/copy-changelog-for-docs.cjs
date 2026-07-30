const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const src = path.join(rootDir, 'CHANGELOG.md')
const dest = path.join(rootDir, 'docs', 'CHANGELOG.md')

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)
