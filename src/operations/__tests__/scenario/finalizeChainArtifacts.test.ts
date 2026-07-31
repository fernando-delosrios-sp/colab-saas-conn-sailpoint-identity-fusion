import { createRequire } from 'node:module'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const require = createRequire(import.meta.url)
const { buildScenario } = require('../../../../scripts/finalize-chain-artifacts.cjs')

describe('finalize-chain-artifacts', () => {
    it('preserves existing scenario config when rebuilding', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalize-test-'))
        const config = { sources: [{ name: 'HR', id: 'src-hr' }] }
        fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({ config }, null, 2) + '\n')

        const steps = [
            {
                stepId: 'step-1',
                operation: 'testConnection',
                duration: 0,
                output: [],
                input: {},
                stateAfter: {
                    identities: [],
                    managedAccounts: [],
                    fusionAccounts: [],
                    fusionIdentityDecisions: [],
                },
            },
        ]

        const scenario = buildScenario('test-chain', steps, dir)
        expect(scenario.config).toEqual(config)

        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('uses empty config when no prior scenario exists', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalize-test-'))
        const steps = [
            {
                stepId: 'step-1',
                operation: 'testConnection',
                duration: 0,
                output: [],
                input: {},
                stateAfter: {},
            },
        ]

        const scenario = buildScenario('fresh-chain', steps, dir)
        expect(scenario.config).toEqual({})

        fs.rmSync(dir, { recursive: true, force: true })
    })
})
