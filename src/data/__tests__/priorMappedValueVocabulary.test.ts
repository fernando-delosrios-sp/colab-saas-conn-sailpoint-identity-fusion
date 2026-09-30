import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

const glossary = read('docs/glossary.md')
const mappingGuide = read('docs/use-guides/configuration/mapping-attributes.md')
const connectorSpec = read('connector-spec.json')

const forbiddenSynonyms = /mapping chain|chained mapping|derived attribute/i

describe('prior mapped value glossary', () => {
    it('Prior mapped value entry', () => {
        const row = glossary.split('\n').find((line) => line.startsWith('| **Prior mapped value**'))
        expect(row).toBeTruthy()
        expect(row).toContain(
            'value an earlier explicit attribute map wrote during the same Map invocation, addressed by that map\'s new attribute name'
        )
        expect(row).toContain('later explicit attribute map can read it')
        expect(row).toContain('cannot read an explicit attribute map listed after it')
        expect(row).toContain('Not a live snapshot attribute')
        expect(row).toContain('definition-owned name')
        expect(row).toContain('pass-through definition')
        expect(row).not.toMatch(forbiddenSynonyms)
        expect(mappingGuide).not.toMatch(forbiddenSynonyms)
        expect(connectorSpec).not.toMatch(forbiddenSynonyms)
    })
})
