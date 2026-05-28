import { readSettings, connectorSpecInitialValues } from '../scopeSettings'

describe('scopeSettings readSettings', () => {
    it('returns defaults when input is empty', () => {
        const raw = {}
        const result = readSettings(raw)
        expect(result.includeIdentities).toBe(connectorSpecInitialValues.includeIdentities)
        expect(result.identityScopeQuery).toBe(connectorSpecInitialValues.identityScopeQuery)
    })

    it('returns configured values when valid', () => {
        const raw = {
            includeIdentities: false,
            identityScopeQuery: 'department:Sales',
        }
        const result = readSettings(raw)
        expect(result.includeIdentities).toBe(false)
        expect(result.identityScopeQuery).toBe('department:Sales')
    })
})
