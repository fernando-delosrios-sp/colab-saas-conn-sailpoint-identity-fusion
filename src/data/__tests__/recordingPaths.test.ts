import { recordingCacheKey, recordingChainDir, recordingChainDirRelative } from '../recordingPaths'

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
})
