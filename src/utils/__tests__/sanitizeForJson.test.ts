import { sanitizeApiPayload } from '../sanitizeForJson'

describe('sanitizeApiPayload', () => {
    it('extracts data from axios-style responses', () => {
        const result = sanitizeApiPayload({
            data: [{ id: 'a' }],
            status: 200,
            statusText: 'OK',
        })
        expect(result).toEqual({ data: [{ id: 'a' }], status: 200, statusText: 'OK' })
    })

    it('handles circular references without throwing', () => {
        const circular: Record<string, unknown> = { data: { ok: true } }
        circular.self = circular
        const result = sanitizeApiPayload(circular)
        expect(result).toEqual({ data: { ok: true }, status: undefined, statusText: undefined })
    })
})
