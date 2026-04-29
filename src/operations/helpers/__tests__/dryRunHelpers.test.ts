import { hostnameSegmentFromBaseurl } from '../dryRunHelpers'

describe('hostnameSegmentFromBaseurl', () => {
    it('uses the first DNS label, not the full FQDN', () => {
        expect(hostnameSegmentFromBaseurl('https://acme.api.identitynow.com/foo')).toBe('acme')
        expect(hostnameSegmentFromBaseurl('https://tenant.example.api.identitynow.com')).toBe('tenant')
    })

    it('returns single-label hosts unchanged', () => {
        expect(hostnameSegmentFromBaseurl('http://localhost:3000')).toBe('localhost')
    })

    it('keeps IPv4 as a sanitized segment', () => {
        expect(hostnameSegmentFromBaseurl('http://192.168.0.12')).toBe('192_168_0_12')
    })

    it('handles missing or invalid baseurl', () => {
        expect(hostnameSegmentFromBaseurl(undefined)).toBe('unknown-host')
        expect(hostnameSegmentFromBaseurl('')).toBe('unknown-host')
        expect(hostnameSegmentFromBaseurl('not-a-url')).toBe('unknown-host')
    })
})
