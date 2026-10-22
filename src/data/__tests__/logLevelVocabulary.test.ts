import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const glossary = readFileSync(join(process.cwd(), 'docs/glossary.md'), 'utf8')

function glossaryRow(term: string): string {
    const row = glossary.split('\n').find((line) => line.startsWith(`| **${term}**`))
    if (!row) throw new Error(`Missing glossary row: ${term}`)
    return row
}

describe('Log level vocabulary', () => {
    it('Glossary entry for Log level', () => {
        const row = glossaryRow('Log level')

        expect(row).toContain('minimum severity')
        expect(row).toContain('ISC host log')
        expect(row).toContain('Error, Warn, Info, Debug')
        expect(row).toContain('Default: Info')
    })

    it('Glossary entry for Log Settings', () => {
        const row = glossaryRow('Log Settings')

        expect(row).toContain('Advanced Settings')
        expect(row).toContain('Log level')
    })

    it('Log level is distinguished from External logging level', () => {
        expect(glossaryRow('Log level')).not.toContain('external endpoint')
        expect(glossaryRow('External logging level')).toContain('external endpoint')
        expect(glossaryRow('External logging level')).toContain('Log level')
    })
})
