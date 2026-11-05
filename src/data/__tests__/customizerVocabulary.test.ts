import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const glossary = readFileSync(join(process.cwd(), 'docs/glossary.md'), 'utf8')

function glossaryEntry(term: string): string {
    const row = glossary.split('\n').find((line) => line.startsWith(`| **${term}**`))
    if (!row) throw new Error(`missing glossary entry ${term}`)
    return row
}

describe('ubiquitous-language glossary: Internal Record packaging', () => {
    it('Internal Record schema entry', () => {
        const entry = glossaryEntry('Internal Record schema')
        expect(entry).toMatch(/saved field list/)
        expect(entry).toMatch(/Account ID/)
        expect(entry).toMatch(/Account Name/)
        expect(entry).toMatch(/multi-valued/)
    })

    it('Internal Record configuration entry', () => {
        const entry = glossaryEntry('Internal Record configuration')
        expect(entry).toMatch(/saved packaging decisions/)
        expect(entry).toMatch(/source name/)
        expect(entry).toMatch(/Internal Record schema/)
        expect(entry).toMatch(/Include record accounts in Match/)
        expect(entry).toMatch(/Accounts JMESPath filter/)
    })

    it('Records Customizer entry', () => {
        const entry = glossaryEntry('Records Customizer')
        expect(entry).toMatch(/packages Internal-record dumps and the Internal Record configuration/)
    })

    it('Customizer Value Store is retired', () => {
        const entry = glossaryEntry('Customizer Value Store')
        expect(entry).toMatch(/Retired/)
        expect(entry).toMatch(/no packaged hash index/)
        expect(entry).not.toMatch(/binary-indexed|64-bit/)
    })

    it('New terms are available to project artifacts', () => {
        expect(glossaryEntry('Internal Record source')).toMatch(/Internal Record configuration/)
        expect(glossaryEntry('Internal Record source')).toMatch(/not identified by a Source Settings file field/)
        expect(glossaryEntry('Internal-record dump')).toMatch(/headered CSV/)
        expect(glossaryEntry('INTERNAL badge')).toMatch(/Internal Record source/)
        const packaged = [
            glossaryEntry('Internal Record source'),
            glossaryEntry('Internal-record dump'),
            glossaryEntry('Internal Record schema'),
            glossaryEntry('Internal Record configuration'),
            glossaryEntry('INTERNAL badge'),
        ].join('\n')
        const retiredManaged = ['managed', 'row'].join(' ')
        expect(packaged).not.toMatch(
            new RegExp(`\\b(?:internal source|CSV source|source record|raw account|${retiredManaged})\\b`)
        )
    })
})
