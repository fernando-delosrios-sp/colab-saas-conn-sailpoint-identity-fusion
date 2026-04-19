import { readFileSync } from 'fs'
import * as path from 'path'
import { defaultFusionMaxCandidatesForForm } from '../connectorDefaults'

describe('connector defaults alignment', () => {
    it('defaultFusionMaxCandidatesForForm matches connectorSpecInitialValues.json', () => {
        const initialPath = path.join(__dirname, '..', 'connectorSpecInitialValues.json')
        const initial = JSON.parse(readFileSync(initialPath, 'utf8')) as { fusionMaxCandidatesForForm?: number }
        expect(typeof initial.fusionMaxCandidatesForForm).toBe('number')
        expect(defaultFusionMaxCandidatesForForm()).toBe(initial.fusionMaxCandidatesForForm)
    })

    it('connector-spec sourceConfigInitialValues matches connectorSpecInitialValues.json', () => {
        const specPath = path.join(__dirname, '..', '..', '..', 'connector-spec.json')
        const initialPath = path.join(__dirname, '..', 'connectorSpecInitialValues.json')
        const spec = JSON.parse(readFileSync(specPath, 'utf8')) as { sourceConfigInitialValues?: Record<string, unknown> }
        const initial = JSON.parse(readFileSync(initialPath, 'utf8')) as Record<string, unknown>
        expect(spec.sourceConfigInitialValues).toEqual(initial)
    })
})
