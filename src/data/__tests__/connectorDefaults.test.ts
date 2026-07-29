import { readFileSync } from 'fs'
import * as path from 'path'
import { connectorSpecInitialValues, defaultFusionMaxCandidatesForForm, resolveFusionMaxCandidatesForForm } from '../config'

describe('connector defaults alignment', () => {
    it('defaultFusionMaxCandidatesForForm matches connectorSpecInitialValues', () => {
        expect(defaultFusionMaxCandidatesForForm()).toBe(connectorSpecInitialValues.fusionMaxCandidatesForForm)
    })

    it('resolveFusionMaxCandidatesForForm falls back to default when unset', () => {
        expect(resolveFusionMaxCandidatesForForm(undefined)).toBe(defaultFusionMaxCandidatesForForm())
        expect(resolveFusionMaxCandidatesForForm(5)).toBe(5)
    })

    it('connector-spec sourceConfigInitialValues matches connectorSpecInitialValues', () => {
        const specPath = path.join(__dirname, '..', '..', '..', 'connector-spec.json')
        const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
            sourceConfigInitialValues?: Record<string, unknown>
        }
        const specInitialValues = connectorSpecInitialValues
        const actualInitialValues = { ...spec.sourceConfigInitialValues }
        expect(actualInitialValues).toEqual(specInitialValues)
    })
})

