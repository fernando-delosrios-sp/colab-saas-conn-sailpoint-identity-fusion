import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const glossary = readFileSync(join(process.cwd(), 'docs/glossary.md'), 'utf8')

const entry = (term: string): string => {
    const row = glossary.split('\n').find((line) => line.startsWith(`| **${term}**`))
    expect(row, term).toBeTruthy()
    return row ?? ''
}

describe('orphan processing mode glossary', () => {
    it('Glossary defines Orphan processing mode', () => {
        const row = entry('Orphan processing mode')
        expect(row).toContain('Orphan accounts')
        expect(row).toContain('Assignment mode')
        expect(row).toContain('Ownership mode')
    })

    it('Glossary defines Assignment mode apart from automatic assignment', () => {
        const row = entry('Assignment mode')
        expect(row).toContain('correlated')
        expect(row).toContain('automatic assignment')
        expect(row).not.toMatch(/\*\*Assignment mode\*\*.*is \*\*Automatic assignment\*\*/)
    })

    it('Glossary defines Ownership mode', () => {
        const row = entry('Ownership mode')
        expect(row).toContain('machine accounts with no owner identity')
        expect(row).toContain("account's owner identity")
    })

    it('Glossary defines Machine account', () => {
        const row = entry('Machine account')
        expect(row).toContain('isMachine')
    })

    it('Glossary defines Owner identity apart from the Fusion source owner', () => {
        const row = entry('Owner identity')
        expect(row).toContain('ownerIdentity')
        expect(row).toContain('correlated identity')
        expect(row).toContain('Fusion source owner')
    })

    it('Glossary defines Established owner identity', () => {
        const row = entry('Established owner identity')
        expect(row).toContain('non-empty')
        expect(row).toContain('missing `ownerIdentity`')
    })
})
