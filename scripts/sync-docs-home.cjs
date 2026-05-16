const fs = require('fs')
const path = require('path')

const rootReadmePath = path.resolve(__dirname, '..', 'README.md')
const docsHomePath = path.resolve(__dirname, '..', 'docs', 'index.md')

const rootReadme = fs.readFileSync(rootReadmePath, 'utf8')

function transformBlockquotesToAdmonitions(text) {
    let lines = text.split('\n')
    let newLines = []
    let inQuote = false

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        if (line.startsWith('> **Tip:** ')) {
            newLines.push('!!! tip')
            newLines.push('    ' + line.substring('> **Tip:** '.length))
            inQuote = true
        } else if (line.startsWith('> **Tip:**')) {
            newLines.push('!!! tip')
            newLines.push('    ' + line.substring('> **Tip:**'.length).trim())
            inQuote = true
        } else if (line.startsWith('> **Note:** ')) {
            newLines.push('!!! note')
            newLines.push('    ' + line.substring('> **Note:** '.length))
            inQuote = true
        } else if (line.startsWith('> **Note:**')) {
            newLines.push('!!! note')
            newLines.push('    ' + line.substring('> **Note:**'.length).trim())
            inQuote = true
        } else if (line.startsWith('> **Disclaimer:** ')) {
            newLines.push('!!! warning "Disclaimer"')
            newLines.push('    ' + line.substring('> **Disclaimer:** '.length))
            inQuote = true
        } else if (line.startsWith('> **Disclaimer:**')) {
            newLines.push('!!! warning "Disclaimer"')
            newLines.push('    ' + line.substring('> **Disclaimer:**'.length).trim())
            inQuote = true
        } else if (line.startsWith('> **Important:** ')) {
            newLines.push('!!! warning "Important"')
            newLines.push('    ' + line.substring('> **Important:** '.length))
            inQuote = true
        } else if (line.startsWith('> ') && inQuote) {
            newLines.push('    ' + line.substring(2))
        } else if (line === '>' && inQuote) {
            newLines.push('')
        } else {
            inQuote = false
            newLines.push(line)
        }
    }
    return newLines.join('\n')
}

const transformedReadme = transformBlockquotesToAdmonitions(rootReadme)

const docsHome = transformedReadme.replace(/\]\(docs\//g, '](./').replace(/\]\(LICENSE\.txt\)/g, '](./LICENSE.txt)')

fs.writeFileSync(docsHomePath, docsHome)
