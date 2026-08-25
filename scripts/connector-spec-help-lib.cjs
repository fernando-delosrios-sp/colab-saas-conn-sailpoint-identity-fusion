/**
 * Shared validation and slimming helpers for connector-spec.json inline help.
 *
 * ISC connector spec (SailPoint docs):
 * - sectionHelpMessage: HTML overview (generous prose + optional <a href> for extra doc links)
 * - docLink + docLinkLabel: primary clickable documentation link (configuration reference)
 * - helpKey: plain-text field help (no markdown)
 *
 * @see https://developer.sailpoint.com/docs/connectivity/saas-connectivity/connector-spec
 */

const DOCS_BASE_URL =
    'https://fernando-delosrios-sp.github.io/colab-saas-conn-sailpoint-identity-fusion/'

/** Common typo: dot instead of hyphen in GitHub username */
const WRONG_DOCS_HOST = 'fernando.delosrios-sp.github.io'

const HELP_KEY_MAX = 300
const SECTION_HELP_MAX = 1000
const HELP_KEY_MAX_SENTENCES = 2
const SECTION_HELP_MAX_SENTENCES = 10

/** @type {Record<string, string>} */
const MENU_SLUGS = {
    'Connection Settings': 'connection',
    'Source Settings': 'source',
    'Attribute Mapping Settings': 'mapping',
    'Attribute Definition Settings': 'definition',
    'Attribute Matching Settings': 'matching',
    'Advanced Settings': 'advanced',
}

/**
 * @param {string} path
 * @param {string} label
 */
function docAnchor(path, label) {
    return `<a href="${docsUrl(path)}">${label}</a>`
}

/**
 * @param {Array<[string, string]>} links
 */
function seeAlso(links) {
    if (links.length === 0) {
        return ''
    }
    const rendered = links.map(([path, label]) => docAnchor(path, label)).join(' · ')
    return `<br><br>See also: ${rendered}.`
}

/**
 * @param {string} url
 */
function normalizeDocUrl(url) {
    return String(url)
        .trim()
        .replace(/#.*$/, '')
        .replace(/\/+$/, '')
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractHtmlHrefs(html) {
    const hrefs = []
    const re = /href="([^"]+)"/gi
    let match
    while ((match = re.exec(String(html || ''))) !== null) {
        hrefs.push(match[1])
    }
    return hrefs
}

/** @type {Record<string, { sectionHelpMessage: string; docLinkLabel: string; docLinkPath: string }>} */
const SECTION_HELP = {
    'Connection Settings': {
        sectionHelpMessage:
            '<strong>Configure how this connector connects to Identity Security Cloud.</strong><br><br>Use <strong>Identity Security Cloud API URL</strong> to specify the base URL of your ISC tenant (for example, <code>https://tenant.api.identitynow.com</code>).<br><br>Provide the <strong>Personal Access Token ID</strong> and <strong>Personal Access Token Secret</strong> for an account that has the required API permissions (Sources, Identities, Accounts, Workflows/Forms). These values authenticate all connector operations.' +
            seeAlso([
                ['use-guides/operation/tune-api-performance/', 'Tune API performance guide'],
                ['reference/pat-scopes/', 'ISC PAT scopes reference'],
            ]),
        docLinkLabel: 'Connection settings reference',
        docLinkPath: 'configuration/connection/',
    },
    Scope: {
        sectionHelpMessage:
            '<strong>Define which identities are in scope.</strong><br><br>Limit processing using an <strong>Identity Scope Query</strong> (standard ISC search syntax). Toggle <strong>Include identities in the scope</strong> to establish a baseline population for Match alongside managed source accounts.' +
            seeAlso([
                ['use-guides/configuration/configuring-sources-and-scope/', 'Configuring sources and scope'],
            ]),
        docLinkLabel: 'Source settings reference',
        docLinkPath: 'configuration/source/',
    },
    Sources: {
        sectionHelpMessage:
            '<strong>Select and configure authoritative account sources.</strong><br><br><strong>Source type and behavior:</strong> Define role (Authoritative, Records, Orphan) and handling for non-matched non-identity accounts (disable, defer).<br><br><strong>Aggregation and correlation:</strong> Control timing (delays, retries), optimized aggregation, and correlation strategy (in-process or reverse).<br><br><strong>Filtering and limits:</strong> Process subsets via API/JMESPath filters and set batch capacities.' +
            seeAlso([
                ['use-guides/configuration/configuring-sources-and-scope/', 'Configuring sources and scope'],
                ['use-guides/configuration/source-types/', 'Source types guide'],
            ]),
        docLinkLabel: 'Source settings reference',
        docLinkPath: 'configuration/source/',
    },
    'Processing Control': {
        sectionHelpMessage:
            '<strong>Control account maintenance.</strong><br><br><strong>History limits:</strong> Cap the number of audit history messages stored per account.<br><br><strong>Delete when empty:</strong> Remove the Fusion account if all its underlying source accounts are deleted.<br><br><strong>Skip missing targets:</strong> Ignore source accounts missing a mapped native identity attribute.' +
            seeAlso([
                ['use-guides/configuration/configuring-sources-and-scope/', 'Configuring sources and scope'],
            ]),
        docLinkLabel: 'Source settings reference',
        docLinkPath: 'configuration/source/',
    },
    'Attribute Mapping Definitions': {
        sectionHelpMessage:
            '<strong>Map and merge source attributes.</strong><br><br>Choose a <strong>Default attribute merge</strong> mode. Then configure per-attribute rules to target specific source fields, rename them on the Fusion account, and optionally override the merge strategy or pin specific sources.' +
            seeAlso([
                ['use-guides/configuration/mapping-attributes/', 'Mapping attributes guide'],
            ]),
        docLinkLabel: 'Mapping settings reference',
        docLinkPath: 'configuration/mapping/',
    },
    'Normal Attribute Definitions': {
        sectionHelpMessage:
            '<strong>Define dynamic computed attributes.</strong> Apache Velocity; optional Always recalculate. Post-template options: case, character normalization, spaces, trim, max length.<br><br>Definitions run top to bottom — each result is available to the next. See the Velocity context reference for <code>$accounts</code>, <code>$identity</code>, <code>$previous</code>, and helper functions.' +
            seeAlso([
                ['use-guides/configuration/defining-attributes/', 'Defining attributes guide'],
                ['reference/velocity-context/', 'Velocity context reference'],
            ]),
        docLinkLabel: 'Normal attribute definitions reference',
        docLinkPath: 'configuration/definition/#normal-attribute-definitions',
    },
    'Unique Attribute Definitions': {
        sectionHelpMessage:
            '<strong>Define persistent unique attributes</strong> (e.g. identifiers). Values stay until account <strong>reset</strong> (disable/re-enable). Runs <strong>after</strong> normal definitions on refresh.<br><br>Supports <code>$counter</code>, <code>$UUID</code>, and <code>$isUnique()</code>. Use incremental counter mode for sequential IDs; otherwise the connector uses collision-based disambiguation with padding per <strong>Minimum counter digits</strong>.' +
            seeAlso([
                ['use-guides/configuration/defining-attributes/', 'Defining attributes guide'],
                ['reference/velocity-context/', 'Velocity context reference'],
            ]),
        docLinkLabel: 'Unique attribute definitions reference',
        docLinkPath: 'configuration/definition/#unique-attribute-definitions',
    },
    'Matching Settings': {
        sectionHelpMessage:
            '<strong>Configure similarity-based match detection.</strong><br><br>Evaluate matches using <strong>Fusion attribute matches</strong> to calculate a <strong>Combined match score</strong>.<br><br><strong>Algorithms:</strong> Text, phonetic, and intelligent gap comparisons.<br><br><strong>Thresholds and weights:</strong> Set minimum scores for individual rules and the overall match. Pass thresholds double as blend weights.<br><br><strong>Automatic merge:</strong> Optionally bypass manual review when the combined score meets your automatic merge threshold.' +
            seeAlso([
                ['use-guides/configuration/matching-identities/', 'Matching identities guide'],
                ['use-guides/configuration/tuning-matching-algorithms/', 'Tuning matching algorithms'],
            ]),
        docLinkLabel: 'Matching settings reference',
        docLinkPath: 'configuration/matching/',
    },
    'Review Settings': {
        sectionHelpMessage:
            '<strong>Configure manual review for potential matches.</strong><br><br>Define <strong>Form attributes</strong> to display to reviewers and set candidate limits. Assign global reviewers to act as fail-safes and optionally email them processing reports after each aggregation.' +
            seeAlso([
                ['use-guides/configuration/review-forms-and-reviewers/', 'Review forms and reviewers'],
            ]),
        docLinkLabel: 'Matching settings reference',
        docLinkPath: 'configuration/matching/',
    },
    'Developer Settings': {
        sectionHelpMessage:
            '<strong>Advanced options for troubleshooting and performance tuning.</strong><br><br>Use these settings to safely recover from configuration changes (e.g. rebuilding accounts or forcing attribute recalculation) and manage memory consumption during match detection by adjusting batch sizes.<br><br>The section header in ISC shows the <strong>installed connector version</strong> for reference — it updates automatically when you upgrade the connector package.' +
            seeAlso([
                ['use-guides/operation/', 'Operation guides'],
            ]),
        docLinkLabel: 'Advanced settings reference',
        docLinkPath: 'configuration/advanced/',
    },
    'External Settings': {
        sectionHelpMessage:
            '<strong>Configure external infrastructure for proxy processing, logging, and recording.</strong><br><br>Enable external processing to reveal a shared target URL and password, then choose sub-options for proxy mode, scenario recording, and external logging. When proxy mode is off, external logging sends HTTP POST to the target URL from ISC. When proxy mode is on, the proxy server writes logs to disk.' +
            seeAlso([
                ['reference/proxy-mode/', 'Proxy mode reference'],
                ['reference/scenario-recording/', 'Scenario recording reference'],
            ]),
        docLinkLabel: 'Advanced settings reference',
        docLinkPath: 'configuration/advanced/',
    },
    'Advanced Connection Settings': {
        sectionHelpMessage:
            '<strong>Fine-tune API limits and execution resilience.</strong><br><br>Adjust these parameters to prevent the connector from being rate-limited by Identity Security Cloud, ensure long-running operations complete without timing out, and optimize throughput by adjusting request concurrency and batching sizes.' +
            seeAlso([
                ['use-guides/operation/tune-api-performance/', 'Tune API performance guide'],
            ]),
        docLinkLabel: 'Advanced settings reference',
        docLinkPath: 'configuration/advanced/',
    },
}

function docsUrl(path) {
    return `${DOCS_BASE_URL}${String(path).replace(/^\//, '')}`
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function stripMarkdownLinks(text) {
    return String(text || '')
        .replace(/\s*See\s+\[[^\]]*\]\([^)]*\)\.?/gi, '')
        .replace(/\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function hasMarkdownLink(text) {
    return /\[[^\]]*\]\([^)]*\)/.test(String(text || ''))
}

function plainTextLength(text) {
    return stripHtml(text).length
}

function firstSentences(text, maxSentences = HELP_KEY_MAX_SENTENCES) {
    const plain = stripMarkdownLinks(stripHtml(text))
    if (!plain) {
        return 'See the documentation site for field details.'
    }
    const parts = plain.split(/(?<=[.!?])\s+/).filter(Boolean)
    const selected = parts.slice(0, maxSentences).join(' ').trim()
    if (!selected) {
        return plain.slice(0, HELP_KEY_MAX - 1)
    }
    return selected.endsWith('.') ? selected : `${selected}.`
}

function hasBulletList(html) {
    return /<(ul|li)\b/i.test(String(html || ''))
}

/** @param {string} prose */
function countSentences(prose) {
    const normalized = String(prose || '')
        .replace(/https?:\/\/[^\s)]+/gi, ' URL ')
        .replace(/\[\.\.\.\]/g, ' ellipsis ')
        .replace(/\s+/g, ' ')
        .trim()
    if (!normalized) {
        return 0
    }
    return normalized.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length
}

/** @param {string} helpKey */
function helpKeySummarySentenceCount(helpKey) {
    const count = countSentences(stripMarkdownLinks(stripHtml(helpKey)))
    return count
}

/** @param {string} html */
function sectionHelpSentenceCount(html) {
    return countSentences(stripHtml(html))
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
                const title = item.sectionTitle || 'section'
                if (item.sectionHelpMessage) {
                    const len = plainTextLength(item.sectionHelpMessage)
                    if (len > SECTION_HELP_MAX) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: `length ${len} exceeds ${SECTION_HELP_MAX}`,
                        })
                    }
                    if (String(item.sectionHelpMessage).includes(WRONG_DOCS_HOST)) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: `uses wrong docs host ${WRONG_DOCS_HOST} (use fernando-delosrios-sp)`,
                        })
                    }
                    if (hasMarkdownLink(item.sectionHelpMessage)) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: 'contains markdown link (use HTML <a href> or docLink instead)',
                        })
                    }
                    if (hasBulletList(item.sectionHelpMessage)) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: 'contains HTML bullet list',
                        })
                    }
                    const sectionSentences = sectionHelpSentenceCount(item.sectionHelpMessage)
                    if (sectionSentences > SECTION_HELP_MAX_SENTENCES) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message: `has ${sectionSentences} sentences (max ${SECTION_HELP_MAX_SENTENCES})`,
                        })
                    }
                }
                if (!item.docLink || !item.docLinkLabel) {
                    violations.push({
                        kind: 'section',
                        id: title,
                        message: 'missing docLink or docLinkLabel',
                    })
                } else if (!/^https?:\/\//.test(String(item.docLink))) {
                    violations.push({
                        kind: 'section',
                        id: title,
                        message: 'docLink must be an absolute https URL',
                    })
                } else if (String(item.docLink).includes(WRONG_DOCS_HOST)) {
                    violations.push({
                        kind: 'section',
                        id: title,
                        message: `docLink uses wrong docs host ${WRONG_DOCS_HOST} (use fernando-delosrios-sp)`,
                    })
                } else if (!String(item.docLink).startsWith(DOCS_BASE_URL)) {
                    violations.push({
                        kind: 'section',
                        id: title,
                        message: 'docLink must use the published documentation site base URL',
                    })
                } else if (!String(item.docLink).includes('/configuration/')) {
                    violations.push({
                        kind: 'section',
                        id: title,
                        message: 'docLink should point to a configuration reference page',
                    })
                } else if (item.sectionHelpMessage) {
                    const sectionUrls = [
                        item.docLink,
                        ...extractHtmlHrefs(item.sectionHelpMessage),
                    ].map(normalizeDocUrl)
                    const seen = new Set()
                    const duplicates = new Set()
                    for (const url of sectionUrls) {
                        if (!url) {
                            continue
                        }
                        if (seen.has(url)) {
                            duplicates.add(url)
                        }
                        seen.add(url)
                    }
                    if (duplicates.size > 0) {
                        violations.push({
                            kind: 'sectionHelpMessage',
                            id: title,
                            message:
                                'duplicate doc link in the same section (See also must not repeat docLink)',
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
        if (hasMarkdownLink(helpKey)) {
            violations.push({
                kind: 'helpKey',
                id: `${menuLabel}/${key}`,
                message: 'contains markdown link (ISC renders helpKey as plain text)',
            })
        }
        const summarySentences = helpKeySummarySentenceCount(helpKey)
        if (summarySentences > HELP_KEY_MAX_SENTENCES) {
            violations.push({
                kind: 'helpKey',
                id: `${menuLabel}/${key}`,
                message: `has ${summarySentences} sentence(s) (max ${HELP_KEY_MAX_SENTENCES})`,
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
 */
function slimHelpKey(item) {
    if (!item.helpKey) {
        return
    }
    item.helpKey = firstSentences(item.helpKey)
}

/**
 * @param {object} item
 */
function slimSectionHelp(item) {
    if (!item.sectionTitle) {
        return
    }

    const config = SECTION_HELP[item.sectionTitle]
    if (!config) {
        return
    }

    item.sectionHelpMessage = config.sectionHelpMessage
    item.docLinkLabel = config.docLinkLabel
    item.docLink = docsUrl(config.docLinkPath)
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
                slimSectionHelp(item)
                walkItems(item.items, menuLabel)
                continue
            }

            if (item.type === 'cardList' && Array.isArray(item.subMenus)) {
                slimHelpKey(item)
                for (const subMenu of item.subMenus) {
                    walkItems(subMenu.items, menuLabel)
                }
                continue
            }

            slimHelpKey(item)
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
    DOCS_BASE_URL,
    HELP_KEY_MAX,
    SECTION_HELP_MAX,
    MENU_SLUGS,
    SECTION_HELP,
    docsUrl,
    docAnchor,
    seeAlso,
    stripHtml,
    stripMarkdownLinks,
    plainTextLength,
    collectViolations,
    slimSpec,
    slimHelpKey,
    slimSectionHelp,
    hasBulletList,
    hasMarkdownLink,
    countSentences,
    helpKeySummarySentenceCount,
    sectionHelpSentenceCount,
    HELP_KEY_MAX_SENTENCES,
    SECTION_HELP_MAX_SENTENCES,
}
