import { readSettings, connectorSpecInitialValues } from '../developerSettings'

describe('developerSettings readSettings', () => {
    it('defaults resetAccounts to false when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.resetAccounts).toBe(false)
    })

    it('defaults resetForms to false when omitted', () => {
        const raw = {}

        const result = readSettings(raw)

        expect(result.resetForms).toBe(false)
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

    it('normalizes string "true" to boolean true for resetAccounts', () => {
        const raw = { resetAccounts: 'true' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.resetAccounts).toBe(true)
    })

    it('normalizes string "false" to boolean false for resetAccounts', () => {
        const raw = { resetAccounts: 'false' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.resetAccounts).toBe(false)
    })

    it('reads legacy reset key as resetAccounts when resetAccounts is omitted', () => {
        const raw = { reset: 'true' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.resetAccounts).toBe(true)
    })

    it('prefers resetAccounts over legacy reset key', () => {
        const raw = {
            resetAccounts: 'false' as unknown as boolean,
            reset: 'true' as unknown as boolean,
        }

        const result = readSettings(raw)

        expect(result.resetAccounts).toBe(false)
    })

    it('normalizes string "true" to boolean true for resetForms', () => {
        const raw = { resetForms: 'true' as unknown as boolean }

        const result = readSettings(raw)

        expect(result.resetForms).toBe(true)
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
