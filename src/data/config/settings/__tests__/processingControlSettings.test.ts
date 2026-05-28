import { readSettings } from '../processingControlSettings'

describe('processingControlSettings readSettings', () => {
    it('defaults deleteEmpty to false when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.deleteEmpty).toBe(false)
    })

    it('normalizes string "true" to boolean true for deleteEmpty', () => {
        const raw = { deleteEmpty: 'true' }

        const result = readSettings(raw)

        expect(result.deleteEmpty).toBe(true)
    })

    it('normalizes string "false" to boolean false for deleteEmpty', () => {
        const raw = { deleteEmpty: 'false' }

        const result = readSettings(raw)

        expect(result.deleteEmpty).toBe(false)
    })

    it('defaults skipAccountsWithMissingId to false when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.skipAccountsWithMissingId).toBe(false)
    })

    it('normalizes string "true" to boolean true for skipAccountsWithMissingId', () => {
        const raw = { skipAccountsWithMissingId: 'true' }

        const result = readSettings(raw)

        expect(result.skipAccountsWithMissingId).toBe(true)
    })

    it('normalizes string "false" to boolean false for skipAccountsWithMissingId', () => {
        const raw = { skipAccountsWithMissingId: 'false' }

        const result = readSettings(raw)

        expect(result.skipAccountsWithMissingId).toBe(false)
    })

    it('preserves boolean values for deleteEmpty and skipAccountsWithMissingId', () => {
        const raw = { deleteEmpty: true, skipAccountsWithMissingId: true }

        const result = readSettings(raw)

        expect(result.deleteEmpty).toBe(true)
        expect(result.skipAccountsWithMissingId).toBe(true)
    })
})