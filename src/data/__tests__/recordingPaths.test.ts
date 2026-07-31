import {
    parseRecordingChainRef,
    parseRecordingScenarioRef,
    recordingCacheKey,
    recordingChainDir,
    recordingChainDirRelative,
    recordingScenarioDir,
    recordingScenarioDirRelative,
} from '../recordingPaths'

describe('recordingPaths', () => {
    const baseurl = 'https://acme.api.identitynow.com'

    it('resolves tenant-scoped absolute scenario directory', () => {
        expect(recordingScenarioDir('prod-baseline', baseurl)).toMatch(/recordings[/\\]acme[/\\]prod-baseline$/)
    })

    it('resolves tenant-scoped relative scenario directory', () => {
        expect(recordingScenarioDirRelative('prod-baseline', baseurl)).toBe('recordings/acme/prod-baseline')
    })

    it('keeps deprecated chain directory aliases', () => {
        expect(recordingChainDir('prod-baseline', baseurl)).toBe(recordingScenarioDir('prod-baseline', baseurl))
        expect(recordingChainDirRelative('prod-baseline', baseurl)).toBe(
            recordingScenarioDirRelative('prod-baseline', baseurl)
        )
    })

    it('isolates scenarios with the same name across tenants', () => {
        const tenantA = recordingScenarioDir('prod-baseline', 'https://acme.api.identitynow.com')
        const tenantB = recordingScenarioDir('prod-baseline', 'https://globex.api.identitynow.com')
        expect(tenantA).not.toBe(tenantB)
    })

    it('uses unknown-tenant when baseurl is missing', () => {
        expect(recordingScenarioDirRelative('local-test')).toBe('recordings/unknown-tenant/local-test')
    })

    it('builds cache keys scoped by tenant and scenario name', () => {
        expect(recordingCacheKey('prod-baseline', baseurl)).toBe('acme/prod-baseline')
    })

    it('parses qualified tenant/scenario references without baseurl', () => {
        expect(parseRecordingScenarioRef('company12926-poc/fernando')).toEqual({
            tenant: 'company12926-poc',
            scenarioName: 'fernando',
            scenarioRef: 'company12926-poc/fernando',
        })
        expect(parseRecordingChainRef('company12926-poc/fernando')).toEqual({
            tenant: 'company12926-poc',
            scenarioName: 'fernando',
            scenarioRef: 'company12926-poc/fernando',
            chainName: 'fernando',
            chainRef: 'company12926-poc/fernando',
        })
        expect(recordingScenarioDir('company12926-poc/fernando')).toMatch(
            /recordings[/\\]company12926-poc[/\\]fernando$/
        )
        expect(recordingCacheKey('company12926-poc/fernando')).toBe('company12926-poc/fernando')
    })

    it('rejects trailing slash without scenario name', () => {
        expect(() => parseRecordingScenarioRef('company12926-poc/')).toThrow(/scenario name is missing/)
        expect(() => parseRecordingChainRef('company12926-poc/')).toThrow(/scenario name is missing/)
    })
})
