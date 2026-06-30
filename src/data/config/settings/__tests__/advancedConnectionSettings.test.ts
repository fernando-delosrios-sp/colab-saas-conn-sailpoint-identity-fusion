import { readSettings } from '../advancedConnectionSettings'

describe('advancedConnectionSettings readSettings', () => {
    it('defaults enablePriority to true when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.enablePriority).toBe(true)
    })

    it('normalizes string "false" to boolean false for enablePriority', () => {
        const raw = { enablePriority: 'false' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.enablePriority).toBe(false)
    })

    it('normalizes string "true" to boolean true for enablePriority', () => {
        const raw = { enablePriority: 'true' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.enablePriority).toBe(true)
    })

    it('preserves boolean values for enablePriority', () => {
        const raw = { enablePriority: false }

        const result = readSettings(raw)

        expect(result.enablePriority).toBe(false)
    })
})
