import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const repositoryRoot = process.cwd()
const thisTest = 'src/data/__tests__/accountVocabulary.test.ts'
const scannedExtensions = new Set(['.json', '.md', '.ts'])
const scannedRoots = ['docs', 'openspec/specs', 'src']
const excludedFiles = new Set(['CHANGELOG.md', 'docs/CHANGELOG.md', thisTest])
const glossary = readFileSync(join(repositoryRoot, 'docs/glossary.md'), 'utf8')
const ubiquitousLanguage = readFileSync(join(repositoryRoot, 'openspec/specs/ubiquitous-language/spec.md'), 'utf8')

const accountRowPatterns = [
    /\bFusion account rows?\b/gi,
    /\bFusion rows?\b/gi,
    /\bidentity-origin rows?\b/gi,
    /\bmanaged-origin rows?\b/gi,
    /\bIdentities rows?\b/g,
    /\borigin rows?\b/gi,
    /\bthis row\b/gi,
    /\bmanaged rows?\b/gi,
    /\bdirectory rows?\b/gi,
    /\bAD rows?\b/g,
    /\bnon-matched rows?\b/gi,
    /\baccount rows?\b/gi,
    /\bstreamed rows?\b/gi,
    /\bOutput row shape\b/gi,
    /\beach row is serialized\b/gi,
    /\bnew rows from\b/gi,
    /\bfusion source row\b/gi,
]

function collectScannedFiles(directory: string): string[] {
    return readdirSync(join(repositoryRoot, directory), { withFileTypes: true }).flatMap((entry) => {
        const repositoryPath = join(directory, entry.name)
        if (entry.isDirectory()) {
            return collectScannedFiles(repositoryPath)
        }
        return scannedExtensions.has(extname(entry.name)) && !excludedFiles.has(repositoryPath) ? [repositoryPath] : []
    })
}

function isAllowedAccountRowUsage(repositoryPath: string, line: string): boolean {
    if (line.includes('per-account')) {
        return true
    }
    if (repositoryPath === 'docs/glossary.md') {
        return /^\| (?:Fusion row|identity-origin row|managed row|non-matched row|account row|origin row|this row)/i.test(
            line
        )
    }
    if (repositoryPath === 'openspec/specs/ubiquitous-language/spec.md') {
        return /^\| `/.test(line) || /\bSHALL NOT\b/.test(line) || /Retired terms/.test(line) || /not ["']/.test(line) || /not as domain/.test(line)
    }
    return false
}

function accountRowJargon(): string[] {
    return scannedRoots.flatMap(collectScannedFiles).flatMap((repositoryPath) => {
        const content = readFileSync(join(repositoryRoot, repositoryPath), 'utf8')
        return content.split('\n').flatMap((line, index) =>
            isAllowedAccountRowUsage(repositoryPath, line)
                ? []
                : accountRowPatterns
                      .filter((pattern) => {
                          pattern.lastIndex = 0
                          return pattern.test(line)
                      })
                      .map(
                          () =>
                              `${relative(repositoryRoot, join(repositoryRoot, repositoryPath))}:${index + 1}: ${line.trim()}`
                      )
        )
    })
}

describe('canonical account vocabulary', () => {
    it('Referring to a Fusion account', () => {
        expect(glossary).toMatch(/Fusion row[^|\n]*\| Fusion account/)
        expect(accountRowJargon()).toEqual([])
    })

    it('Referring to a managed source account', () => {
        expect(glossary).toMatch(/managed row[^|\n]*\| managed source account/)
        expect(accountRowJargon()).toEqual([])
    })

    it('Referring to identity-origin or origin snapshot', () => {
        expect(glossary).toMatch(/identity-origin row[^|\n]*\| identity-origin Fusion account/)
        expect(accountRowJargon()).toEqual([])
    })

    it('Table rows remain allowed', () => {
        const mappingGuide = readFileSync(
            join(repositoryRoot, 'docs/use-guides/configuration/mapping-attributes.md'),
            'utf8'
        )
        const dryRunGuide = readFileSync(join(repositoryRoot, 'docs/operations/dry-run.md'), 'utf8')
        const exactMatch = readFileSync(join(repositoryRoot, 'src/services/matchingService/exactMatch.ts'), 'utf8')
        expect(mappingGuide).toContain('mapping row')
        expect(dryRunGuide).toContain('per-account non-match rows')
        expect(exactMatch).toContain('ExactMatchScoreRow')
    })

    it('rowsSent counts streamed Fusion accounts', () => {
        const accountListSpec = readFileSync(join(repositoryRoot, 'openspec/specs/account-list-operation/spec.md'), 'utf8')
        expect(accountListSpec).toMatch(/`rowsSent`[^.\n]*(?:Fusion accounts|`StdAccountListOutput` objects)/i)
        expect(ubiquitousLanguage).toMatch(/`rowsSent`[^.\n]*(?:Fusion accounts|`StdAccountListOutput` objects)/i)
    })

    it('Comments do not call accounts rows', () => {
        expect(accountRowJargon().filter((hit) => hit.startsWith('src/'))).toEqual([])
    })

    it('Guide documentation', () => {
        expect(accountRowJargon().filter((hit) => hit.startsWith('docs/'))).toEqual([])
    })

    it('Operation documentation', () => {
        const operationDocs = ['docs/operations/account-list.md', 'docs/operations/dry-run.md']
            .map((path) => readFileSync(join(repositoryRoot, path), 'utf8'))
            .join('\n')
        expect(operationDocs).not.toMatch(/\b(?:streamed?|streaming|previewing) account rows?\b/i)
    })
})

describe('Map glossary terms', () => {
    it('Vanished snapshot key entry', () => {
        expect(glossary).toMatch(/\*\*Vanished snapshot key\*\*/)
        expect(glossary).toMatch(/deletes it from `attributeBag\.current`/)
        expect(glossary).not.toMatch(/orphaned attribute.*synonym/i)
    })

    it('Definition-owned name entry', () => {
        expect(glossary).toMatch(/\*\*Definition-owned name\*\*/)
        expect(glossary).toMatch(/normalAttributeDefinitions/)
        expect(glossary).toMatch(/uniqueAttributeDefinitions/)
        expect(glossary).toMatch(/neither merges nor clears/)
    })

    it('Unmapped snapshot key entry', () => {
        expect(glossary).toMatch(/\*\*Unmapped snapshot key\*\*/)
        expect(glossary).toMatch(/not every Fusion schema attribute/)
        expect(glossary).toMatch(/vanished snapshot keys/)
    })

    it('Identities snapshot entry', () => {
        expect(glossary).toMatch(/\*\*Identities snapshot\*\*/)
        expect(glossary).toMatch(/not a separate merge algebra/)
    })
})
