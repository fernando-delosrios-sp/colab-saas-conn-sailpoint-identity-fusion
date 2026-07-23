import { readSettings, connectorSpecInitialValues } from '../developerSettings'

describe('developerSettings readSettings', () => {
    it('defaults reset to false when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.reset).toBe(false)
    })

    it('defaults managedAccountsBatchSize to 100 when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.managedAccountsBatchSize).toBe(connectorSpecInitialValues.managedAccountsBatchSize)
    })

    it('returns configured managedAccountsBatchSize when valid', () => {
        const raw = { managedAccountsBatchSize: 25 }

        const result = readSettings(raw)

        expect(result.managedAccountsBatchSize).toBe(25)
    })

    it('defaults scoringMaxConcurrency to 12 when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.scoringMaxConcurrency).toBe(connectorSpecInitialValues.scoringMaxConcurrency)
    })

    it('returns configured scoringMaxConcurrency when valid', () => {
        const raw = { scoringMaxConcurrency: 5 }

        const result = readSettings(raw)

        expect(result.scoringMaxConcurrency).toBe(5)
    })

    it('normalizes string "true" to boolean true for reset', () => {
        const raw = { reset: 'true' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.reset).toBe(true)
    })

    it('normalizes string "false" to boolean false for reset', () => {
        const raw = { reset: 'false' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.reset).toBe(false)
    })

    it('defaults concurrencyCheckEnabled to true when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.concurrencyCheckEnabled).toBe(true)
    })

    it('normalizes string "false" to boolean false for concurrencyCheckEnabled', () => {
        const raw = { concurrencyCheckEnabled: 'false' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.concurrencyCheckEnabled).toBe(false)
    })

    it('defaults forceAttributeRefresh to false when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.forceAttributeRefresh).toBe(false)
    })

    it('normalizes string "true" to boolean true for forceAttributeRefresh', () => {
        const raw = { forceAttributeRefresh: 'true' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.forceAttributeRefresh).toBe(true)
    })

    it('defaults externalLoggingEnabled to false when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.externalLoggingEnabled).toBe(false)
    })

    it('normalizes string "true" to boolean true for externalLoggingEnabled', () => {
        const raw = { externalLoggingEnabled: 'true' as unknown as boolean, externalLoggingUrl: 'http://localhost' }

        const result = readSettings(raw)

        expect(result.externalLoggingEnabled).toBe(true)
    })
})
