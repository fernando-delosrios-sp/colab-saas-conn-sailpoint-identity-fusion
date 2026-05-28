import { readSettings, connectorSpecInitialValues } from '../uniqueAttributeDefinitionsSettings'
import type { UniqueAttributeDefinition } from '../../../../model/config'

describe('uniqueAttributeDefinitionsSettings readSettings', () => {
    it('returns defaults when input is empty', () => {
        const raw = {}
        const result = readSettings(raw)
        expect(result.uniqueAttributeDefinitions).toEqual([])
        expect(result.maxAttempts).toBe(connectorSpecInitialValues.maxAttempts)
    })

    it('returns configured values when valid', () => {
        const defs: UniqueAttributeDefinition[] = [{ name: 'email', expression: 'expr', normalize: false, spaces: false, trim: false }]
        const raw = {
            uniqueAttributeDefinitions: defs,
            maxAttempts: 5,
        }
        const result = readSettings(raw)
        expect(result.uniqueAttributeDefinitions).toEqual(defs)
        expect(result.maxAttempts).toBe(5)
    })
})
