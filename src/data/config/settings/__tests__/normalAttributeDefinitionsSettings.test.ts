import { readSettings } from '../normalAttributeDefinitionsSettings'
import type { NormalAttributeDefinition } from '../../../../model/config'

describe('normalAttributeDefinitionsSettings readSettings', () => {
    it('returns empty array when input is empty', () => {
        const raw = {}
        const result = readSettings(raw)
        expect(result.normalAttributeDefinitions).toEqual([])
    })

    it('returns configured values when valid', () => {
        const defs: NormalAttributeDefinition[] = [{ name: 'department', expression: 'expr', normalize: false, spaces: false, trim: false, refresh: false }]
        const raw = {
            normalAttributeDefinitions: defs,
        }
        const result = readSettings(raw)
        expect(result.normalAttributeDefinitions).toEqual(defs)
    })
})
