import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('ubiquitous-language Spec: Customizer terms', () => {
    const root = process.cwd()
    const canonicalSpecPath = join(root, 'openspec/specs/ubiquitous-language/spec.md')

    it('Scenario: Customizer Value Store entry', () => {
        const specContent = readFileSync(canonicalSpecPath, 'utf8')

        expect(specContent).toContain('Customizer Value Store')
        expect(specContent).toMatch(/Customizer Value Store.*(?:binary-indexed|64-bit|heap)/is)
    })

    it('Scenario: Records Customizer entry', () => {
        const specContent = readFileSync(canonicalSpecPath, 'utf8')

        expect(specContent).toContain('Records Customizer')
        expect(specContent).toMatch(/Records Customizer.*(?:customizer|CSV|binary index)/is)
    })
})
