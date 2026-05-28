import { readSettings } from '../advancedConnectionSettings'

describe('advancedConnectionSettings readSettings', () => {
    it('defaults enableQueue to true when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.enableQueue).toBe(true)
    })

    it('normalizes string "false" to boolean false for enableQueue', () => {
        const raw = { enableQueue: 'false' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.enableQueue).toBe(false)
    })

    it('normalizes string "true" to boolean true for enableQueue', () => {
        const raw = { enableQueue: 'true' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.enableQueue).toBe(true)
    })

    it('defaults enableRetry to true when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.enableRetry).toBe(true)
    })

    it('normalizes string "false" to boolean false for enableRetry', () => {
        const raw = { enableRetry: 'false' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.enableRetry).toBe(false)
    })

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

    it('preserves boolean values for enableQueue', () => {
        const raw = { enableQueue: false }

        const result = readSettings(raw)

        expect(result.enableQueue).toBe(false)
    })
})