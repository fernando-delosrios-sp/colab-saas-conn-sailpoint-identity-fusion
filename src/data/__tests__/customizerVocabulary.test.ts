import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

describe('ubiquitous-language Spec: Customizer terms', () => {
    const root = process.cwd()
    const deltaSpecPath = join(root, 'openspec/changes/customizer-unique-ids/specs/ubiquitous-language/spec.md')
    const canonicalSpecPath = join(root, 'openspec/specs/ubiquitous-language/spec.md')

    it('Scenario: Customizer Value Store entry', () => {
        const specContent = existsSync(deltaSpecPath)
            ? readFileSync(deltaSpecPath, 'utf8')
            : readFileSync(canonicalSpecPath, 'utf8')

        expect(specContent).toContain('Customizer Value Store')
        expect(specContent).toMatch(/Customizer Value Store.*(?:binary-indexed|64-bit|heap)/is)
    })

    it('Scenario: Unique Values Customizer entry', () => {
        const specContent = existsSync(deltaSpecPath)
            ? readFileSync(deltaSpecPath, 'utf8')
            : readFileSync(canonicalSpecPath, 'utf8')

        expect(specContent).toContain('Unique Values Customizer')
        expect(specContent).toMatch(/Unique Values Customizer.*(?:customizer|CSV|binary index)/is)
    })
})
