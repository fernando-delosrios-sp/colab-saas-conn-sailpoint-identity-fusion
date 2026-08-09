import path from 'node:path'
import { ESLint } from 'eslint'

describe('private member naming convention (eslint.config.mjs)', () => {
    let eslint: ESLint

    beforeAll(() => {
        eslint = new ESLint({
            overrideConfigFile: path.join(process.cwd(), 'eslint.config.mjs'),
        })
    })

    async function lintSnippet(code: string, filePath = 'src/__tests__/fixtures/naming-sample.ts') {
        const [result] = await eslint.lintText(code, { filePath })
        return result
    }

    it('reports underscore-prefixed private fields', async () => {
        const result = await lintSnippet('export class Example { private _value = 1 }')
        const namingErrors = result.messages.filter((m) => m.ruleId === '@typescript-eslint/naming-convention')
        expect(namingErrors.length).toBeGreaterThan(0)
    })

    it('allows unused parameters prefixed with underscore', async () => {
        const result = await lintSnippet('export function example(_unused: string) { return 1 }')
        expect(result.errorCount).toBe(0)
    })

    it('allows Value-suffixed private accessor backing fields', async () => {
        const result = await lintSnippet(`
            export class Example {
                private nameValue?: string
                get name() {
                    return this.nameValue
                }
            }
        `)
        const namingErrors = result.messages.filter((m) => m.ruleId === '@typescript-eslint/naming-convention')
        expect(namingErrors).toHaveLength(0)
    })
})
