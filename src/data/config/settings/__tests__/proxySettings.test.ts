import { readSettings, connectorSpecInitialValues } from '../proxySettings'

describe('proxySettings readSettings', () => {
    it('returns defaults when input is empty', () => {
        const raw = {}
        const result = readSettings(raw)
        expect(result.proxyEnabled).toBe(connectorSpecInitialValues.proxyEnabled)
        expect(result.proxyUrl).toBe(connectorSpecInitialValues.proxyUrl)
        expect(result.proxyPassword).toBe(connectorSpecInitialValues.proxyPassword)
        expect(result.proxyRequestTimeoutMs).toBeUndefined()
    })

    it('returns configured values when valid', () => {
        const raw = {
            proxyEnabled: true,
            proxyUrl: 'http://proxy.example.com',
            proxyPassword: 'secretpassword',
            proxyRequestTimeoutMs: 5000,
        }
        const result = readSettings(raw)
        expect(result.proxyEnabled).toBe(true)
        expect(result.proxyUrl).toBe('http://proxy.example.com')
        expect(result.proxyPassword).toBe('secretpassword')
        expect(result.proxyRequestTimeoutMs).toBe(5000)
    })
})
