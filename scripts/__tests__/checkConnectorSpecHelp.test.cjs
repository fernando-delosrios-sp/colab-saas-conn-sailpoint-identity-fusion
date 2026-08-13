/* global describe, it, expect */
const {
    collectViolations,
    plainTextLength,
    slimSpec,
    HELP_KEY_MAX,
    SECTION_HELP_MAX,
    DOCS_BASE_URL,
} = require('../connector-spec-help-lib.cjs')

describe('connector-spec-help-lib', () => {
    it('passes a spec with ISC-compliant section and field help', () => {
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
                                '<strong>Configure ISC connection.</strong><br><br>Provide tenant URL and PAT credentials.',
                            docLinkLabel: 'Connection settings reference',
                            docLink: `${DOCS_BASE_URL}configuration/connection/`,
                            items: [
                                {
                                    key: 'baseurl',
                                    label: 'API URL',
                                    helpKey: 'Tenant API base URL for Identity Security Cloud.',
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
        expect(violations.some((v) => v.kind === 'section' && v.message.includes('docLink'))).toBe(
            true
        )
    })

    it('reports markdown links in help strings', () => {
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
                                'Overview. See [Docs](configuration/connection.md).',
                            docLinkLabel: 'Reference',
                            docLink: `${DOCS_BASE_URL}configuration/connection/`,
                            items: [
                                {
                                    key: 'baseurl',
                                    label: 'API URL',
                                    helpKey: 'Tenant URL. See [API URL](configuration/connection.md#baseurl).',
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const violations = collectViolations(spec)
        expect(violations.some((v) => v.kind === 'sectionHelpMessage' && v.message.includes('markdown'))).toBe(
            true
        )
        expect(violations.some((v) => v.kind === 'helpKey' && v.message.includes('markdown'))).toBe(true)
    })

    it('reports helpKey with too many summary sentences', () => {
        const spec = {
            sourceConfig: [
                {
                    type: 'menu',
                    label: 'Source Settings',
                    items: [
                        {
                            type: 'section',
                            sectionTitle: 'Sources',
                            sectionHelpMessage: '<strong>Sources.</strong>',
                            docLinkLabel: 'Source settings reference',
                            docLink: `${DOCS_BASE_URL}configuration/source/`,
                            items: [
                                {
                                    key: 'name',
                                    label: 'Source name',
                                    helpKey: 'First sentence. Second sentence. Third sentence.',
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        expect(
            collectViolations(spec).some(
                (v) => v.kind === 'helpKey' && v.message.includes('3 sentence')
            )
        ).toBe(true)
    })

    it('slimSpec applies section overview and docLink fields', () => {
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
        const section = spec.sourceConfig[0].items[0]
        expect(plainTextLength(section.sectionHelpMessage)).toBeLessThanOrEqual(SECTION_HELP_MAX)
        expect(section.docLink).toMatch(/^https:\/\//)
        expect(section.docLink).toContain('#normal-attribute-definitions')
        expect(section.docLinkLabel).toBe('Normal attribute definitions reference')
        expect(section.sectionHelpMessage).not.toMatch(/\]\(/)
        expect(section.sectionHelpMessage).not.toContain('configuration/definition/')
    })
})
