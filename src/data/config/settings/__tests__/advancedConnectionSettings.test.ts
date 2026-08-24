import { readSettings, connectorSpecInitialValues, runtimeDefaults } from '../advancedConnectionSettings'

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

    it('defaults processingWait to 250 seconds when omitted', () => {
        const result = readSettings({})

        expect(result.processingWait).toBe(250_000)
        expect(result.processingWait).toBe(runtimeDefaults.processingWait)
    })

    it('defaults statsLoggingIntervalMs to 10 seconds when heartbeatInterval omitted', () => {
        const result = readSettings({})

        expect(result.statsLoggingIntervalMs).toBe(10_000)
        expect(result.statsLoggingIntervalMs).toBe(runtimeDefaults.statsLoggingIntervalMs)
    })

    it('converts heartbeatInterval seconds to statsLoggingIntervalMs', () => {
        const result = readSettings({ heartbeatInterval: 30 })

        expect(result.statsLoggingIntervalMs).toBe(30_000)
    })

    it('connectorSpecInitialValues heartbeatInterval matches runtime default', () => {
        expect(connectorSpecInitialValues.heartbeatInterval * 1000).toBe(runtimeDefaults.statsLoggingIntervalMs)
    })

    it('connectorSpecInitialValues processingWait matches runtime default', () => {
        expect(connectorSpecInitialValues.processingWait * 1000).toBe(runtimeDefaults.processingWait)
    })
})
