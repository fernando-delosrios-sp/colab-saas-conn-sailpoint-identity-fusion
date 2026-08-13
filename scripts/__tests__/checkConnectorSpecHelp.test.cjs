/* global describe, it, expect */
const {
    collectViolations,
    plainTextLength,
    slimSpec,
    HELP_KEY_MAX,
    SECTION_HELP_MAX,
} = require('../connector-spec-help-lib.cjs')

describe('connector-spec-help-lib', () => {
    it('passes a spec with slim helpKey and sectionHelpMessage', () => {
        const spec = {
            sourceConfig: [
                {
                    type: 'menu',
                    label: 'Connection Settings',
                    items: [
                        {
                            type: 'section',
                            sectionTitle: 'Connection Settings',
                            sectionHelpMessage:
                                '<strong>Configure ISC connection.</strong> See [Connection Settings](configuration/connection.md).',
                            items: [
                                {
                                    key: 'baseurl',
                                    label: 'API URL',
                                    helpKey:
                                        'Tenant API base URL. See [API URL](configuration/connection.md#baseurl).',
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        expect(collectViolations(spec)).toEqual([])
        expect(plainTextLength(spec.sourceConfig[0].items[0].items[0].helpKey)).toBeLessThanOrEqual(
            HELP_KEY_MAX
        )
    })

    it('reports verbose helpKey and sectionHelpMessage violations', () => {
        const spec = {
            sourceConfig: [
                {
                    type: 'menu',
                    label: 'Source Settings',
                    items: [
                        {
                            type: 'section',
                            sectionTitle: 'Sources',
                            sectionHelpMessage:
                                '<strong>Long section.</strong><ul><li>bullet</li></ul>'.repeat(20),
                            items: [
                                {
                                    key: 'name',
                                    label: 'Source name',
                                    helpKey: 'x'.repeat(HELP_KEY_MAX + 1),
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const violations = collectViolations(spec)
        expect(violations.some((v) => v.kind === 'helpKey' && v.message.includes('exceeds'))).toBe(
            true
        )
        expect(
            violations.some((v) => v.kind === 'sectionHelpMessage' && v.message.includes('bullet'))
        ).toBe(true)
    })

    it('slimSpec rewrites section help to under SECTION_HELP_MAX', () => {
        const spec = {
            sourceConfig: [
                {
                    type: 'menu',
                    label: 'Attribute Definition Settings',
                    items: [
                        {
                            type: 'section',
                            sectionTitle: 'Normal Attribute Definitions',
                            sectionHelpMessage: 'x'.repeat(500),
                            items: [],
                        },
                    ],
                },
            ],
        }

        slimSpec(spec)
        const message = spec.sourceConfig[0].items[0].sectionHelpMessage
        expect(plainTextLength(message)).toBeLessThanOrEqual(SECTION_HELP_MAX)
        expect(message).toMatch(/velocity-context\.md/)
    })
})
