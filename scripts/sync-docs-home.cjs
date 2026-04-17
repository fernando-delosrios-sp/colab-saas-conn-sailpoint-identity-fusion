const fs = require('fs')
const path = require('path')

const rootReadmePath = path.resolve(__dirname, '..', 'README.md')
const docsHomePath = path.resolve(__dirname, '..', 'docs', 'home.md')

const rootReadme = fs.readFileSync(rootReadmePath, 'utf8')

const docsHome = rootReadme
    .replace(/\]\(docs\//g, '](./')
    .replace(/\]\(LICENSE\.txt\)/g, '](./LICENSE.txt)')

fs.writeFileSync(docsHomePath, docsHome)
