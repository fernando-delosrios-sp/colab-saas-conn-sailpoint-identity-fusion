import { readSettings, connectorSpecInitialValues } from '../reviewSettings'

describe('reviewSettings readSettings', () => {
    it('returns defaults when input is empty', () => {
        const raw = {}
        const result = readSettings(raw)
        expect(result.fusionFormAttributes).toEqual([])
        expect(result.fusionFormExpirationDays).toBe(connectorSpecInitialValues.fusionFormExpirationDays)
        expect(result.fusionMaxCandidatesForForm).toBe(connectorSpecInitialValues.fusionMaxCandidatesForForm)
        expect(result.fusionOwnerIsGlobalReviewer).toBeUndefined()
        expect(result.fusionReportOnAggregation).toBeUndefined()
    })

    it('returns configured values when valid', () => {
        const raw = {
            fusionFormAttributes: ['email', 'department'],
            fusionFormExpirationDays: 14,
            fusionMaxCandidatesForForm: 5,
            fusionOwnerIsGlobalReviewer: true,
            fusionReportOnAggregation: false,
        }
        const result = readSettings(raw)
        expect(result.fusionFormAttributes).toEqual(['email', 'department'])
        expect(result.fusionFormExpirationDays).toBe(14)
        expect(result.fusionMaxCandidatesForForm).toBe(5)
        expect(result.fusionOwnerIsGlobalReviewer).toBe(true)
        expect(result.fusionReportOnAggregation).toBe(false)
    })
})
