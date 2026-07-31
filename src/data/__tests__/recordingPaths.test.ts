import { parseRecordingChainRef, recordingCacheKey, recordingChainDir, recordingChainDirRelative } from '../recordingPaths'

describe('recordingPaths', () => {
    const baseurl = 'https://acme.api.identitynow.com'

    it('resolves tenant-scoped absolute chain directory', () => {
        expect(recordingChainDir('prod-baseline', baseurl)).toMatch(/recordings[/\\]acme[/\\]prod-baseline$/)
    })

    it('resolves tenant-scoped relative chain directory', () => {
        expect(recordingChainDirRelative('prod-baseline', baseurl)).toBe('recordings/acme/prod-baseline')
    })

    it('isolates chains with the same name across tenants', () => {
        const tenantA = recordingChainDir('prod-baseline', 'https://acme.api.identitynow.com')
        const tenantB = recordingChainDir('prod-baseline', 'https://globex.api.identitynow.com')
        expect(tenantA).not.toBe(tenantB)
    })

    it('uses unknown-tenant when baseurl is missing', () => {
        expect(recordingChainDirRelative('local-test')).toBe('recordings/unknown-tenant/local-test')
    })

    it('builds cache keys scoped by tenant and chain name', () => {
        expect(recordingCacheKey('prod-baseline', baseurl)).toBe('acme/prod-baseline')
    })

    it('parses qualified tenant/chain references without baseurl', () => {
        expect(parseRecordingChainRef('company12926-poc/fernando')).toEqual({
            tenant: 'company12926-poc',
            chainName: 'fernando',
            chainRef: 'company12926-poc/fernando',
        })
        expect(recordingChainDir('company12926-poc/fernando')).toMatch(
            /recordings[/\\]company12926-poc[/\\]fernando$/
        )
        expect(recordingCacheKey('company12926-poc/fernando')).toBe('company12926-poc/fernando')
    })

    it('rejects trailing slash without chain name', () => {
        expect(() => parseRecordingChainRef('company12926-poc/')).toThrow(/chain name is missing/)
    })
})
