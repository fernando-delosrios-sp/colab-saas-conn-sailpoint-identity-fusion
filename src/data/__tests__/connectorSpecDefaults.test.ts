import { readFileSync } from 'fs'
import * as path from 'path'
import { defaultFusionMaxCandidatesForForm } from '../connectorSpecDefaults'

describe('connectorSpecDefaults', () => {
    it('returns fusionMaxCandidatesForForm from connector-spec.json sourceConfigInitialValues', () => {
        const specPath = path.join(__dirname, '..', '..', '..', 'connector-spec.json')
        const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
            sourceConfigInitialValues?: { fusionMaxCandidatesForForm?: number }
        }
        const expected = spec.sourceConfigInitialValues?.fusionMaxCandidatesForForm
        expect(typeof expected).toBe('number')
        expect(defaultFusionMaxCandidatesForForm()).toBe(expected)
    })
})
