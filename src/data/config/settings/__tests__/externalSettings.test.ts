import { ConnectorError } from '@sailpoint/connector-sdk'
import { connectorSpecInitialValues, readSettings, runtimeDefaults } from '../externalSettings'

describe('externalSettings.readSettings', () => {
    it('returns connector-spec defaults when raw config is empty', () => {
        const result = readSettings({})

        expect(result.externalProcessingEnabled).toBe(connectorSpecInitialValues.externalProcessingEnabled)
        expect(result.externalTargetUrl).toBe(connectorSpecInitialValues.externalTargetUrl)
        expect(result.externalProxyEnabled).toBe(connectorSpecInitialValues.externalProxyEnabled)
        expect(result.externalLoggingEnabled).toBe(connectorSpecInitialValues.externalLoggingEnabled)
        expect(result.externalLoggingLevel).toBe(runtimeDefaults.externalLoggingLevel)
    })

    it('gateway off leaves sub-options stored but does not validate them', () => {
        const result = readSettings({
            externalProcessingEnabled: false,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            externalLoggingEnabled: true,
        })

        expect(result.externalProcessingEnabled).toBe(false)
        expect(result.externalProxyEnabled).toBe(true)
    })

    it('requires target URL when proxy is enabled under gateway', () => {
        expect(() =>
            readSettings({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetPassword: 'secret',
            })
        ).toThrow(ConnectorError)
    })

    it('requires password when proxy is enabled', () => {
        expect(() =>
            readSettings({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetUrl: 'https://proxy.example.com',
            })
        ).toThrow(ConnectorError)
    })

    it('requires proxy when recording is enabled', () => {
        expect(() =>
            readSettings({
                externalProcessingEnabled: true,
                externalRecordingEnabled: true,
                recordingName: 'my-chain',
            })
        ).toThrow(ConnectorError)
    })

    it('requires recording name when recording is enabled', () => {
        expect(() =>
            readSettings({
                externalProcessingEnabled: true,
                externalProxyEnabled: true,
                externalTargetUrl: 'https://proxy.example.com',
                externalTargetPassword: 'secret',
                externalRecordingEnabled: true,
            })
        ).toThrow(ConnectorError)
    })

    it('requires target URL for logging-only path when proxy is off', () => {
        expect(() =>
            readSettings({
                externalProcessingEnabled: true,
                externalLoggingEnabled: true,
            })
        ).toThrow(ConnectorError)
    })

    it('accepts logging-only configuration with http target URL', () => {
        const result = readSettings({
            externalProcessingEnabled: true,
            externalLoggingEnabled: true,
            externalTargetUrl: 'https://logs.example.com/ingest',
        })

        expect(result.externalLoggingEnabled).toBe(true)
        expect(result.externalTargetUrl).toBe('https://logs.example.com/ingest')
    })

    it('accepts full proxy + recording configuration', () => {
        const result = readSettings({
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
        })

        expect(result.externalRecordingEnabled).toBe(true)
        expect(result.recordingName).toBe('prod-baseline')
    })

    it('normalizes numeric ISC toggle values for external settings', () => {
        const result = readSettings({
            externalProcessingEnabled: 1 as unknown as boolean,
            externalProxyEnabled: 1 as unknown as boolean,
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
        })

        expect(result.externalProcessingEnabled).toBe(true)
        expect(result.externalProxyEnabled).toBe(true)
    })
})

