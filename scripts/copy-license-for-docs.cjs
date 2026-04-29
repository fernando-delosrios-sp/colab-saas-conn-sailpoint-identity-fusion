const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const src = path.join(rootDir, 'LICENSE.txt')
const dest = path.join(rootDir, 'docs', 'LICENSE.txt')

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)
