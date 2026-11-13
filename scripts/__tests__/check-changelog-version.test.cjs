/* global describe, it, expect */
const { changelogVersionsAbove, compareSemver } = require('../check-changelog-version.cjs')

describe('check-changelog-version', () => {
    it('orders semver triples', () => {
        expect(compareSemver('2.2.0', '2.2.0')).toBe(0)
        expect(compareSemver('2.2.1', '2.2.0')).toBe(1)
        expect(compareSemver('2.1.9', '2.2.0')).toBe(-1)
        expect(compareSemver('4.0.0', '2.2.0')).toBe(1)
    })

    it('accepts the manifest version and older dated headings', () => {
        const markdown = ['## 2026-11-11 · v2.2.0', '## 2026-08-24', '## 2026-09-03 · v2.2.0'].join('\n')

        expect(changelogVersionsAbove(markdown, '2.2.0')).toEqual([])
    })

    it('rejects a heading above the manifest version', () => {
        const markdown = ['## 2026-11-11 · v4.1.0', '## 2026-09-08 · v2.2.1', '## 2026-10-27 · v2.2.0'].join('\n')

        expect(changelogVersionsAbove(markdown, '2.2.0').map((violation) => violation.line)).toEqual([1, 2])
    })

    it('rejects a version token that is not X.Y.Z', () => {
        const markdown = '## 2026-11-11 · v2.2'

        expect(changelogVersionsAbove(markdown, '2.2.0')).toEqual([{ line: 1, text: '## 2026-11-11 · v2.2' }])
    })
})
