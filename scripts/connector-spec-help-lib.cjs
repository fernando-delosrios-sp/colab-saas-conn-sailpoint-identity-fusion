/**
 * Shared validation and slimming helpers for connector-spec.json inline help.
 *
 * Limits (plain text, HTML excluded):
 * - helpKey: 220 chars, must link to configuration/<slug>.md
 * - sectionHelpMessage: 320 chars, must include a doc link, no <ul>/<li>
 */

const HELP_KEY_MAX = 220
const SECTION_HELP_MAX = 320

/** @type {Record<string, string>} */
const MENU_SLUGS = {
    'Connection Settings': 'connection',
    'Source Settings': 'source',
    'Attribute Mapping Settings': 'mapping',
    'Attribute Definition Settings': 'definition',
    'Attribute Matching Settings': 'matching',
    'Advanced Settings': 'advanced',
}

/** @type {Record<string, string>} */
const SECTION_SLIM_HTML = {
    'Connection Settings':
        '<strong>Configure how this connector connects to Identity Security Cloud.</strong> See [Connection Settings](configuration/connection.md).',
    Scope: '<strong>Define which identities are in scope.</strong> See [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md).',
    Sources:
        '<strong>Select and configure authoritative account sources.</strong> See [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md).',
    'Processing Control':
        '<strong>Control account maintenance and processing behavior.</strong> See [Source Settings](configuration/source.md).',
    'Attribute Mapping Definitions':
        '<strong>Map and merge source attributes onto Fusion accounts.</strong> See [Mapping attributes](../use-guides/configuration/mapping-attributes.md).',
    'Normal Attribute Definitions':
        '<strong>Define dynamic computed attributes with Apache Velocity.</strong> See [Defining attributes](../use-guides/configuration/defining-attributes.md) and [Velocity context](../reference/velocity-context.md).',
    'Unique Attribute Definitions':
        '<strong>Define persistent unique identifiers.</strong> See [Defining attributes](../use-guides/configuration/defining-attributes.md) and [Unique variables](../reference/velocity-context.md#unique-only-variables).',
    'Matching Settings':
        '<strong>Configure similarity-based match detection.</strong> See [Matching identities](../use-guides/configuration/matching-identities.md).',
    'Review Settings':
        '<strong>Configure manual review for potential matches.</strong> See [Review forms and reviewers](../use-guides/configuration/review-forms-and-reviewers.md).',
    'Developer Settings':
        '<strong>Advanced troubleshooting and performance tuning.</strong> See [Operation guides](../use-guides/operation/index.md).',
    'External Settings':
        '<strong>Configure proxy, logging, and scenario recording.</strong> See [Proxy mode](../reference/proxy-mode.md).',
    'Advanced Connection Settings':
        '<strong>Fine-tune API limits and execution resilience.</strong> See [Tune API performance](../use-guides/operation/tune-api-performance.md).',
}

const MARKDOWN_LINK_RE = /\[[^\]]+\]\([^)]+\)/
const CONFIG_LINK_RE = /\]\(configuration\/[^)]+\)/
const DOC_LINK_RE = /\]\((?:configuration\/|\.\.\/(?:use-guides|reference)\/)[^)]+\)/

function stripHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function plainTextLength(text) {
    return stripHtml(text).length
}

function anchorForKey(key) {
    return String(key)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

function firstSentence(text) {
    const plain = stripHtml(text)
        .replace(/\.?\s*See \[[^\]]+\]\([^)]+\)\.?$/i, '')
        .trim()
    if (!plain) {
        return 'See the Configuration reference for details'
    }
    const match = plain.match(/^(.{1,120}?)([.!?](?:\s|$)|$)/)
    return match ? match[1].replace(/[.!?]$/, '') : plain.slice(0, 120)
}

function hasBulletList(html) {
    return /<(ul|li)\b/i.test(String(html || ''))
}

/**
 * @param {object} spec
 * @returns {Array<{ kind: string; id: string; message: string }>}
 */
function collectViolations(spec) {
    /** @type {Array<{ kind: string; id: string; message: string }>} */
    const violations = []

    /**
     * @param {unknown[]} items
     * @param {string} menuLabel
     */
    function walkItems(items, menuLabel) {
        if (!Array.isArray(items)) {
            return
        }

        for (const item of items) {
            if (!item || typeof item !== 'object') {
                continue
            }

            if (item.type === 'section') {
                if (item.sectionHelpMessage) {
                    const title = item.sectionTitle || 'section'
                    const len = plainTextLength(item.sectionHelpMessage)
                    if (len > SECTION_HELP_MAX) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: `length ${len} exceeds ${SECTION_HELP_MAX}`,
                        })
                    }
                    if (!DOC_LINK_RE.test(item.sectionHelpMessage) && !MARKDOWN_LINK_RE.test(item.sectionHelpMessage)) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: 'missing documentation link',
                        })
                    }
                    if (hasBulletList(item.sectionHelpMessage)) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: 'contains HTML bullet list',
                        })
                    }
                }
                walkItems(item.items, menuLabel)
                continue
            }

            if (item.type === 'cardList' && Array.isArray(item.subMenus)) {
                if (item.helpKey) {
                    checkHelpKey(item.helpKey, item.key || item.label || 'cardList', menuLabel)
                }
                for (const subMenu of item.subMenus) {
                    walkItems(subMenu.items, menuLabel)
                }
                continue
            }

            if (item.helpKey) {
                checkHelpKey(item.helpKey, item.key || item.label || 'field', menuLabel)
            }
        }
    }

    function checkHelpKey(helpKey, key, menuLabel) {
        const len = plainTextLength(helpKey)
        if (len > HELP_KEY_MAX) {
            violations.push({
                kind: 'helpKey',
                id: `${menuLabel}/${key}`,
                message: `length ${len} exceeds ${HELP_KEY_MAX}`,
            })
        }
        if (!CONFIG_LINK_RE.test(helpKey)) {
            violations.push({
                kind: 'helpKey',
                id: `${menuLabel}/${key}`,
                message: 'missing configuration/ documentation link',
            })
        }
    }

    for (const menu of spec.sourceConfig || []) {
        if (menu.type !== 'menu') {
            continue
        }
        walkItems(menu.items, menu.label)
    }

    return violations
}

/**
 * @param {object} item
 * @param {string} menuLabel
 */
function slimHelpKey(item, menuLabel) {
    if (!item.helpKey) {
        return
    }

    const slug = MENU_SLUGS[menuLabel]
    if (!slug || !item.key) {
        return
    }

    const anchor = anchorForKey(item.key)
    const label = item.label || item.key
    const summary = firstSentence(item.helpKey)
    item.helpKey = `${summary}. See [${label}](configuration/${slug}.md#${anchor}).`
}

/**
 * @param {object} item
 */
function slimSectionHelpMessage(item) {
    if (!item.sectionTitle || !item.sectionHelpMessage) {
        return
    }

    const slim = SECTION_SLIM_HTML[item.sectionTitle]
    if (slim) {
        item.sectionHelpMessage = slim
    }
}

/**
 * @param {object} spec
 */
function slimSpec(spec) {
    /**
     * @param {unknown[]} items
     * @param {string} menuLabel
     */
    function walkItems(items, menuLabel) {
        if (!Array.isArray(items)) {
            return
        }

        for (const item of items) {
            if (!item || typeof item !== 'object') {
                continue
            }

            if (item.type === 'section') {
                slimSectionHelpMessage(item)
                walkItems(item.items, menuLabel)
                continue
            }

            if (item.type === 'cardList' && Array.isArray(item.subMenus)) {
                slimHelpKey(item, menuLabel)
                for (const subMenu of item.subMenus) {
                    walkItems(subMenu.items, menuLabel)
                }
                continue
            }

            slimHelpKey(item, menuLabel)
        }
    }

    for (const menu of spec.sourceConfig || []) {
        if (menu.type !== 'menu') {
            continue
        }
        walkItems(menu.items, menu.label)
    }
}

module.exports = {
    HELP_KEY_MAX,
    SECTION_HELP_MAX,
    MENU_SLUGS,
    SECTION_SLIM_HTML,
    stripHtml,
    plainTextLength,
    collectViolations,
    slimSpec,
    slimHelpKey,
    slimSectionHelpMessage,
    hasBulletList,
}
