import { readFileSync } from 'fs'
import path from 'path'
import { readSettings, connectorSpecInitialValues, runtimeDefaults } from '../logSettings'

describe('logSettings readSettings', () => {
    it('defaults logLevel to info when omitted', () => {
        const result = readSettings({})

        expect(result.logLevel).toBe('info')
        expect(result.logLevel).toBe(runtimeDefaults.logLevel)
    })

    it('accepts a configured logLevel', () => {
        expect(readSettings({ logLevel: 'warn' }).logLevel).toBe('warn')
        expect(readSettings({ logLevel: 'error' }).logLevel).toBe('error')
        expect(readSettings({ logLevel: 'debug' }).logLevel).toBe('debug')
    })

    it('falls back to info for an invalid logLevel without throwing', () => {
        expect(() => readSettings({ logLevel: 'verbose' })).not.toThrow()
        expect(readSettings({ logLevel: 'verbose' }).logLevel).toBe('info')
    })

    it('connectorSpecInitialValues logLevel matches runtime default', () => {
        expect(connectorSpecInitialValues.logLevel).toBe(runtimeDefaults.logLevel)
    })

    it('connector-spec exposes a Log Settings radio with the four levels', () => {
        const specPath = path.join(__dirname, '..', '..', '..', '..', '..', 'connector-spec.json')
        type SpecNode = {
            key?: string
            label?: string
            type?: string
            value?: unknown
            sectionTitle?: string
            items?: SpecNode[]
            options?: SpecNode[]
        }
        const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
            sourceConfig?: SpecNode[]
            sourceConfigInitialValues?: { logLevel?: string }
        }
        const sections = (spec.sourceConfig ?? []).flatMap((menu) => menu.items ?? [])
        const logSettings = sections.find((section) => section.sectionTitle === 'Log Settings')
        const radio = (logSettings?.items ?? []).find((item) => item.key === 'logLevel')

        expect(logSettings).toBeDefined()
        expect(radio?.label).toBe('Log level')
        expect(radio?.type).toBe('radio')
        expect((radio?.options ?? []).map((option) => option.value)).toEqual(['error', 'warn', 'info', 'debug'])
        expect(spec.sourceConfigInitialValues.logLevel).toBe('info')
    })
})
