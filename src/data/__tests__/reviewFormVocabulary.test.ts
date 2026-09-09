import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (repositoryPath: string) => readFileSync(join(process.cwd(), repositoryPath), 'utf8')

const glossary = read('docs/glossary.md')
const ubiquitousLanguage = read('openspec/specs/ubiquitous-language/spec.md')
const reviewFormsGuide = read('docs/use-guides/configuration/review-forms-and-reviewers.md')
const resetGuide = read('docs/use-guides/operation/reset-fusion-state.md')

describe('review form display vocabulary', () => {
    it('Glossary entry for DESCRIPTION HTML', () => {
        for (const source of [glossary, ubiquitousLanguage]) {
            expect(source).toMatch(
                /\*\*DESCRIPTION HTML\*\*\s*\|[^\n]*DESCRIPTION element content rendered as HTML[^\n]*\{\{\$\.form\.input\.<key>\}\}[^\n]*not TEXT fields/
            )
        }
    })

    it('Glossary entry for in-flight review', () => {
        for (const source of [glossary, ubiquitousLanguage]) {
            expect(source).toMatch(
                /\*\*in-flight review\*\*\s*\|[^\n]*still pending[^\n]*off the Match work queue[^\n]*stale-by-expiration form cleanup[^\n]*stuck processing/
            )
        }
    })
})

describe('review form documentation', () => {
    it('Review forms guide describes the HTML layout', () => {
        expect(reviewFormsGuide).toMatch(/\*\*DESCRIPTION HTML\*\* aligned with the Fusion review email/)
        expect(reviewFormsGuide).toMatch(
            /columns: attribute, value, algorithm, threshold, result, score; match\/miss\/combined row colors/
        )
        expect(reviewFormsGuide).toMatch(/\*\*new identity \/ no match\*\* toggle and the identities SELECT/)
    })

    it('Reset Fusion state guide describes recut of in-flight reviews', () => {
        expect(resetGuide).toMatch(/Closes in-flight Fusion reviews/)
        expect(resetGuide).toMatch(/does not migrate pending instances by itself/)
        expect(resetGuide).toMatch(/no per-account review reset flag/)
    })
})
