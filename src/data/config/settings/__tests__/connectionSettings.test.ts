import { readSettings } from '../connectionSettings'

describe('connectionSettings readSettings', () => {
    it('throws error if baseurl is missing', () => {
        const raw = {
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        }

        expect(() => readSettings(raw)).toThrow('Base URL is required in configuration')
    })

    it('throws error if baseurl has an invalid scheme', () => {
        const raw = {
            baseurl: 'file:///etc/passwd',
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        }

        expect(() => readSettings(raw)).toThrow('Base URL must use http or https protocol')
    })

    it('succeeds if baseurl has a valid http scheme', () => {
        const raw = {
            baseurl: 'http://localhost:8000',
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        }

        expect(() => readSettings(raw)).not.toThrow()
    })

    it('succeeds if baseurl has a valid https scheme', () => {
        const raw = {
            baseurl: 'https://example.com',
            clientId: 'id',
            clientSecret: 'secret',
            spConnectorInstanceId: 'inst',
        }

        expect(() => readSettings(raw)).not.toThrow()
    })
})
