#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const specPath = path.join(rootDir, 'connector-spec.json')
const outDir = path.join(rootDir, 'docs', 'configuration')

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
const USE_GUIDE_BY_MENU = {
    'Connection Settings': '../use-guides/operation/connection-and-observability-tuning.md',
    'Source Settings': '../use-guides/configuration/configuring-sources.md',
    'Attribute Mapping Settings': '../use-guides/configuration/mapping-attributes.md',
    'Attribute Definition Settings': '../use-guides/configuration/defining-attributes.md',
    'Attribute Matching Settings': '../use-guides/configuration/matching-identities.md',
    'Advanced Settings': '../use-guides/operation/connection-and-observability-tuning.md',
}

/** @type {Record<string, string>} */
const USE_GUIDE_BY_SECTION = {
    Review: '../use-guides/configuration/review-forms-and-reviewers.md',
    Proxy: '../reference/proxy-mode.md',
}

function anchorForKey(key) {
    return String(key)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

function stripHtml(html) {
    return String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function defaultForKey(initialValues, key) {
    if (!Object.prototype.hasOwnProperty.call(initialValues, key)) {
        return '—'
    }
    const value = initialValues[key]
    if (typeof value === 'string') {
        return value === '' ? '*(empty)*' : `\`${value}\``
    }
    if (typeof value === 'boolean') {
        return `\`${String(value)}\``
    }
    if (value === null || value === undefined) {
        return '—'
    }
    return `\`${JSON.stringify(value)}\``
}

function parentConstraint(item) {
    if (!item.parentKey) {
        return '—'
    }
    return `Shown when \`${item.parentKey}\` = \`${item.parentValue}\``
}

function typeDescription(item) {
    const parts = [item.type || 'unknown']
    if (item.type === 'select' && Array.isArray(item.options)) {
        parts.push(`options: ${item.options.map((o) => o.label || o.value).join(', ')}`)
    }
    return parts.join('; ')
}

/**
 * @param {unknown[]} items
 * @param {Record<string, unknown>} initialValues
 * @param {string} menuLabel
 * @param {string} sectionTitle
 * @param {string[]} lines
 */
function walkItems(items, initialValues, menuLabel, pageSlug, sectionTitle, lines, contextLabel = '') {
    if (!Array.isArray(items)) {
        return
    }

    for (const item of items) {
        if (!item || typeof item !== 'object') {
            continue
        }

        if (item.type === 'section') {
            const nestedTitle = item.sectionTitle || sectionTitle
            walkItems(item.items, initialValues, menuLabel, pageSlug, nestedTitle, lines, contextLabel)
            continue
        }

        if (item.type === 'cardList' && Array.isArray(item.subMenus)) {
            lines.push(`### ${item.label || item.key}`)
            lines.push('')
            lines.push(`| Property | Value |`)
            lines.push(`| --- | --- |`)
            lines.push(`| **Key** | \`${item.key}\` |`)
            lines.push(`| **Type** | cardList |`)
            lines.push(`| **Required** | ${item.required ? 'Yes' : 'No'} |`)
            lines.push('')
            for (const subMenu of item.subMenus) {
                lines.push(`#### ${subMenu.label}`)
                lines.push('')
                walkItems(subMenu.items, initialValues, menuLabel, pageSlug, sectionTitle, lines, subMenu.label)
            }
            continue
        }

        if (!item.key) {
            continue
        }

        const anchor = anchorForKey(item.key)
        const headingLabel = [contextLabel, sectionTitle !== menuLabel ? sectionTitle : '', item.label || item.key]
            .filter(Boolean)
            .join(' — ')
        const useGuide =
            USE_GUIDE_BY_SECTION[sectionTitle] ||
            USE_GUIDE_BY_MENU[menuLabel] ||
            '../use-guides/index.md'

        lines.push(`### ${headingLabel} {#${anchor}}`)
        lines.push('')
        lines.push(`| Property | Value |`)
        lines.push(`| --- | --- |`)
        lines.push(`| **Key** | \`${item.key}\` |`)
        lines.push(`| **Type** | ${typeDescription(item)} |`)
        lines.push(`| **Required** | ${item.required ? 'Yes' : 'No'} |`)
        lines.push(`| **Default** | ${defaultForKey(initialValues, item.key)} |`)
        lines.push(`| **Conditional** | ${parentConstraint(item)} |`)
        if (item.helpKey) {
            const helpKeyForPage = item.helpKey.replace(
                new RegExp(`configuration/${pageSlug}\\.md#`, 'g'),
                '#'
            )
            lines.push(`| **Inline help** | ${helpKeyForPage.replace(/\|/g, '\\|')} |`)
        }
        lines.push(`| **Use guide** | [Scenario guidance](${useGuide}) |`)
        lines.push('')
    }
}

function renderMenuPage(menu, initialValues) {
    const slug = MENU_SLUGS[menu.label]
    if (!slug) {
        throw new Error(`Unknown menu label: ${menu.label}`)
    }

    const lines = [
        '<!-- markdownlint-disable MD024 MD034 -->',
        '',
        `# ${menu.label}`,
        '',
        `Generated from \`connector-spec.json\`. For workflow guidance, see the linked Use guides.`,
        '',
    ]

    for (const item of menu.items || []) {
        if (item.type !== 'section') {
            continue
        }
        const sectionTitle = item.sectionTitle || menu.label
        lines.push(`## ${sectionTitle}`)
        lines.push('')
        if (item.sectionHelpMessage) {
            lines.push(stripHtml(item.sectionHelpMessage))
            lines.push('')
        }
        walkItems(item.items, initialValues, menu.label, slug, sectionTitle, lines)
    }

    return { slug, content: `${lines.join('\n').trim()}\n` }
}

function renderIndex(menus) {
    const lines = [
        '<!-- markdownlint-disable MD024 -->',
        '',
        '# Configuration reference',
        '',
        'Field-level reference for Identity Fusion NG source configuration in ISC. Pages are generated from `connector-spec.json` when you run `npm run docs:prepare`.',
        '',
        'For scenario-driven setup, start with [Use guides](../use-guides/index.md).',
        '',
        '## Menus',
        '',
    ]

    for (const menu of menus) {
        const slug = MENU_SLUGS[menu.label]
        lines.push(`- [${menu.label}](${slug}.md)`)
    }

    lines.push('')
    return `${lines.join('\n')}\n`
}

function main() {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
    const initialValues = spec.sourceConfigInitialValues || {}
    const menus = (spec.sourceConfig || []).filter((entry) => entry.type === 'menu')

    fs.mkdirSync(outDir, { recursive: true })

    fs.writeFileSync(path.join(outDir, 'index.md'), renderIndex(menus))

    for (const menu of menus) {
        const { slug, content } = renderMenuPage(menu, initialValues)
        fs.writeFileSync(path.join(outDir, `${slug}.md`), content)
    }

    console.log(`Generated ${menus.length + 1} configuration reference pages in docs/configuration/`)
}

main()
