import { readFileSync } from 'fs'
import * as path from 'path'
import { connectorSpecInitialValues, defaultFusionMaxCandidatesForForm } from '../config'

describe('connector defaults alignment', () => {
    it('defaultFusionMaxCandidatesForForm matches connectorSpecInitialValues', () => {
        expect(defaultFusionMaxCandidatesForForm()).toBe(connectorSpecInitialValues.fusionMaxCandidatesForForm)
    })

    it('connector-spec sourceConfigInitialValues matches connectorSpecInitialValues', () => {
        const specPath = path.join(__dirname, '..', '..', '..', 'connector-spec.json')
        const spec = JSON.parse(readFileSync(specPath, 'utf8')) as { sourceConfigInitialValues?: Record<string, unknown> }
        const { parallelBatchSize: _ignored, ...specInitialValues } = connectorSpecInitialValues
        expect(spec.sourceConfigInitialValues).toEqual(specInitialValues)
    })
})
