import { applySettings } from '../connectionSettings'
import type { FusionConfigBuild } from '../../types'

describe('connectionSettings applySettings', () => {
    it('throws error if baseurl is missing', () => {
        const config = {
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        } as unknown as FusionConfigBuild

        expect(() => applySettings(config)).toThrow('Base URL is required in configuration')
    })

    it('throws error if baseurl has an invalid scheme', () => {
        const config = {
            baseurl: 'file:///etc/passwd',
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        } as unknown as FusionConfigBuild

        expect(() => applySettings(config)).toThrow('Base URL must use http or https protocol')
    })

    it('succeeds if baseurl has a valid http scheme', () => {
        const config = {
            baseurl: 'http://localhost:8000',
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        } as unknown as FusionConfigBuild

        expect(() => applySettings(config)).not.toThrow()
    })

    it('succeeds if baseurl has a valid https scheme', () => {
        const config = {
            baseurl: 'https://example.com',
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        } as unknown as FusionConfigBuild

        expect(() => applySettings(config)).not.toThrow()
    })
})
