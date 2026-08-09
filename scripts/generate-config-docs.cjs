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

/** @type {Record<string, { title: string; path: string; blurb: string }>} */
const USE_GUIDE_BY_MENU = {
    'Connection Settings': {
        title: 'Tune API performance',
        path: '../use-guides/operation/tune-api-performance.md',
        blurb: 'PAT setup, queue sizing, retries, timeouts, and rate-limit tuning.',
    },
    'Source Settings': {
        title: 'Configuring sources and scope',
        path: '../use-guides/configuration/configuring-sources-and-scope.md',
        blurb: 'Identity scope, umbrella vs side-car deployment, aggregation, and correlation.',
    },
    'Attribute Mapping Settings': {
        title: 'Mapping attributes',
        path: '../use-guides/configuration/mapping-attributes.md',
        blurb: 'Merge strategies, multi-source examples, and schema considerations.',
    },
    'Attribute Definition Settings': {
        title: 'Defining attributes',
        path: '../use-guides/configuration/defining-attributes.md',
        blurb: 'Velocity examples, unique IDs, UUIDs, counters, and transformation recipes.',
    },
    'Attribute Matching Settings': {
        title: 'Matching identities',
        path: '../use-guides/configuration/matching-identities.md',
        blurb: 'Match detection workflow, thresholds, and baseline configuration.',
    },
    'Advanced Settings': {
        title: 'Operation guides',
        path: '../use-guides/operation/index.md',
        blurb: 'Monitor, tune, proxy, recording, dry-run, and reset workflows.',
    },
}

/** @type {Record<string, { title: string; path: string; blurb: string }>} */
const USE_GUIDE_BY_SECTION = {
    'Matching Settings': {
        title: 'Tuning matching algorithms',
        path: '../use-guides/configuration/tuning-matching-algorithms.md',
        blurb: 'Algorithm selection, threshold tuning, and score blending walkthroughs.',
    },
    'Review Settings': {
        title: 'Review forms and reviewers',
        path: '../use-guides/configuration/review-forms-and-reviewers.md',
        blurb: 'Manual review forms, reviewer assignment, and decision workflows.',
    },
    'External Settings': {
        title: 'Proxy deployment',
        path: '../reference/proxy-mode.md',
        blurb: 'Self-hosted proxy architecture and setup (technical reference).',
    },
}

/** @type {Record<string, Array<{ title: string; path: string }>>} */
const ADDITIONAL_GUIDES_BY_MENU = {
    'Attribute Matching Settings': [
        {
            title: 'Tuning matching algorithms',
            path: '../use-guides/configuration/tuning-matching-algorithms.md',
        },
        {
            title: 'Review forms and reviewers',
            path: '../use-guides/configuration/review-forms-and-reviewers.md',
        },
        {
            title: 'Match tuning cookbooks',
            path: '../use-guides/configuration/match-tuning-cookbooks.md',
        },
    ],
    'Advanced Settings': [
        {
            title: 'Proxy deployment',
            path: '../reference/proxy-mode.md',
        },
    ],
}

function renderGuideCallout(guide, label = 'Configuration guide') {
    if (!guide) {
        return []
    }
    return [
        `!!! tip "${label}"`,
        `    **[${guide.title}](${guide.path})** — ${guide.blurb}`,
        '',
    ]
}

function renderPageGuideBlock(menuLabel) {
    const primary = USE_GUIDE_BY_MENU[menuLabel]
    const additional = ADDITIONAL_GUIDES_BY_MENU[menuLabel] || []
    const lines = [
        'This page documents **field semantics** — keys, types, defaults, conditionals, and option values.',
        'For **scenario walkthroughs**, examples, and tuning recipes, use the linked guides below.',
        '',
    ]

    if (primary) {
        lines.push(...renderGuideCallout(primary))
    }

    if (additional.length > 0) {
        const extras = additional
            .filter((g) => !primary || g.path !== primary.path)
            .map((g) => `[${g.title}](${g.path})`)
        if (extras.length > 0) {
            lines.push(`**See also:** ${extras.join(' · ')}`, '')
        }
    }

    return lines
}

/** @type {Record<string, Record<string, string>>} */
const FIELD_EXPLANATIONS = {
    connection: {
        baseurl:
            'The tenant API base URL used for every ISC call. Must match your tenant region (for example `https://tenant.api.identitynow.com` or the EU equivalent).',
        clientId: 'The Client ID portion of your PAT. Pair with the secret below; both are required for authentication.',
        clientSecret:
            'The Client Secret portion of your PAT. Stored as a secret in ISC source configuration. See [ISC PAT scopes](../reference/pat-scopes.md) for required API permissions.',
    },
    source: {
        includeIdentities:
            'When enabled, identities matching the scope query are included as a baseline for Match scoring alongside managed source accounts.',
        identityScopeQuery:
            'Standard ISC search query that limits which identities Fusion considers in scope. Leave empty to include all identities (subject to ISC search limits).',
        sourceType:
            'Controls how accounts from this source are processed: **Authoritative** (full Map/Define/Match), **Records** (Map/Define without Fusion account output), or **Orphan** (Match-only supplemental data).',
        disableNonMatchingAccounts:
            'For **Orphan** sources: when enabled, triggers a background disable on the managed source for accounts that no longer match any identity.',
        deferredMatching:
            'After identity scoring, also compare this account to other provisional Fusion accounts from the same source in the current run before creating a new identity.',
        includeRecordAccountsForMatching:
            'For **Records** sources: when enabled (default), record accounts participate in Match scoring like other managed accounts. When disabled, Match is skipped and a bulk unique-registration step runs instead.',
        aggregationMode:
            'Controls when managed source accounts are refreshed relative to Fusion processing: none, before processing (waits for aggregation task), or delayed (schedules aggregation after processing).',
        correlationMode:
            'How uncorrelated managed accounts link to identities: in-process correlation or reverse correlation (writes back to identity profile attributes). Reverse correlation requires additional PAT scopes.',
    },
    mapping: {
        attributeMerge:
            'Default strategy when multiple sources provide a value for the same Fusion attribute. Override per attribute when needed.',
        newAttribute: 'Target attribute name on the Fusion account schema.',
        existingAttributes:
            'One or more source attribute names to pull values from. The connector tries each in order according to the merge strategy.',
    },
    definition: {
        name: 'Attribute name written to the Fusion account after the Velocity template and post-processing transforms run.',
        expression:
            'Apache Velocity template that computes the attribute value. See [Velocity context reference](../reference/velocity-context.md) for helpers and context variables.',
        static:
            'When enabled, the attribute is evaluated only when it has no existing value. Overrides refresh behavior for immutable attributes.',
        refresh:
            'When enabled, recalculates the attribute on every aggregation. When disabled, recalculates only when underlying source data changes.',
        case: 'Applies letter-case transformation after the Velocity template renders.',
        normalize:
            'Replaces accented and special characters with plain ASCII equivalents (for example `José` → `Jose`). Useful for usernames and match keys.',
        spaces: 'Removes all whitespace from the rendered value. Common for login IDs and employee numbers.',
        trim: 'Strips leading and trailing whitespace from the rendered value.',
        maxLength:
            'Truncates the rendered value to this character count. For unique definitions, the connector preserves counter suffixes when possible.',
        maxAttempts:
            'Maximum retries when generating a unique value that collides with an existing registration. Increase for large datasets with high collision risk.',
        digits: 'Minimum zero-padding width for the `$counter` suffix in unique definitions (for example `3` → `001`, `002`).',
        useIncrementalCounter:
            'When enabled, `$counter` always increments sequentially across aggregations. When disabled (default), counter suffixes are added only on collision.',
        counterStart: 'First counter value when incremental counter mode is enabled.',
    },
    matching: {
        fusionAttributeMatches:
            'Per-attribute Match rules. Each rule contributes to the combined score when its individual threshold is met.',
        combinedMatchScore:
            'Minimum combined score (0–100) required for a candidate to be considered a potential match.',
        automaticMergeThreshold:
            'When the combined score meets or exceeds this threshold, the connector auto-merges without manual review.',
    },
}

/** @type {Record<string, Record<string, string>>} */
const SELECT_OPTION_HINTS = {
    same: 'Leave the rendered value unchanged.',
    lower: 'Convert the entire value to lower case.',
    upper: 'Convert the entire value to upper case.',
    capitalize: 'Capitalize the first character of the value.',
    firstFound: 'Use the first non-null value in configured source order.',
    list: 'Collect all distinct non-null values into an array.',
    concatenate: 'Join distinct values in brackets with spaces (for example `[Engineering] [IT]`).',
    authoritative: 'Full Map, Define, and Match pipeline; non-matched rows can create identities when Fusion is authoritative.',
    record: 'Map and Define run; unique values register without emitting Fusion accounts for non-matched rows.',
    orphan: 'Supplemental Match-only source; non-matched rows are dropped (optionally disabled on the managed source).',
    none: 'Do not trigger managed source aggregation automatically.',
    before: 'Aggregate the managed source and wait for completion before Fusion processing.',
    delayed: 'Schedule managed source aggregation after Fusion processing completes.',
    inProcess: 'Correlate managed accounts to identities during Fusion processing.',
    reverse: 'Write correlation back to identity profile attributes on the managed source.',
}

function anchorForKey(key) {
    return String(key)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

function _stripHtml(html) {
    return String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function htmlToMarkdown(html) {
    if (!html) {
        return ''
    }

    let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>\s*<li>/gi, '\n- ')
        .replace(/<ul>\s*/gi, '\n')
        .replace(/<\/ul>/gi, '\n')
        .replace(/<li>/gi, '- ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<code>(.*?)<\/code>/gi, '`$1`')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    return text
}

function rewriteConfigLinks(text, pageSlug) {
    return String(text || '').replace(new RegExp(`\\(configuration/${pageSlug}\\.md#`, 'g'), '(#')
}

function helpDescription(helpKey, pageSlug) {
    if (!helpKey) {
        return ''
    }
    return rewriteConfigLinks(helpKey, pageSlug).trim()
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
    if (item.min !== undefined) {
        parts.push(`min: ${item.min}`)
    }
    if (item.max !== undefined) {
        parts.push(`max: ${item.max}`)
    }
    return parts.join('; ')
}

function fieldExplanation(pageSlug, item) {
    const keyed = FIELD_EXPLANATIONS[pageSlug]?.[item.key]
    if (keyed) {
        return keyed
    }
    return helpDescription(item.helpKey, pageSlug)
}

/** @type {Record<string, string>} */
const SECTION_INTRO_OVERRIDES = {
    'Normal Attribute Definitions':
        'Define computed attributes with Apache Velocity. Values can refresh each aggregation or stay static. Post-template options include case, normalization, spaces, trim, and max length.\n\nSee [Velocity context reference](../reference/velocity-context.md) for context variables (`$accounts`, `$identity`, `$previous`) and helper functions.',
    'Unique Attribute Definitions':
        'Define persistent unique identifiers (usernames, employee IDs, UUIDs). Values persist until account reset. Runs after normal definitions; supports `$counter`, `$UUID`, and `$isUnique()`.\n\nSee [Velocity context — Unique-only variables](../reference/velocity-context.md#unique-only-variables) and [Defining attributes](../use-guides/configuration/defining-attributes.md) for recipes.',
}

function renderSelectOptions(item) {
    if (item.type !== 'select' || !Array.isArray(item.options) || item.options.length === 0) {
        return []
    }

    const lines = ['**Options:**', '', '| Value | Label | Notes |', '| --- | --- | --- |']
    for (const option of item.options) {
        const value = option.value ?? ''
        const label = option.label ?? value
        const hint = SELECT_OPTION_HINTS[value] || '—'
        lines.push(`| \`${value}\` | ${label} | ${hint} |`)
    }
    lines.push('')
    return lines
}

/**
 * @param {unknown[]} items
 * @param {Record<string, unknown>} initialValues
 * @param {string} menuLabel
 * @param {string} pageSlug
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
            if (item.helpKey) {
                lines.push(helpDescription(item.helpKey, pageSlug))
                lines.push('')
            }
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
        const explanation = fieldExplanation(pageSlug, item)

        lines.push(`### ${headingLabel} {#${anchor}}`)
        lines.push('')
        if (explanation) {
            lines.push(explanation)
            lines.push('')
        }
        lines.push(`| Property | Value |`)
        lines.push(`| --- | --- |`)
        lines.push(`| **Key** | \`${item.key}\` |`)
        lines.push(`| **Type** | ${typeDescription(item)} |`)
        lines.push(`| **Required** | ${item.required ? 'Yes' : 'No'} |`)
        lines.push(`| **Default** | ${defaultForKey(initialValues, item.key)} |`)
        lines.push(`| **Conditional** | ${parentConstraint(item)} |`)
        lines.push('')
        lines.push(...renderSelectOptions(item))
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
        `Field-level reference generated from \`connector-spec.json\`.`,
        '',
        ...renderPageGuideBlock(menu.label),
    ]

    if (slug === 'connection') {
        lines.push(
            'Configure ISC API connectivity. Required PAT scopes are documented in [ISC PAT scopes](../reference/pat-scopes.md).',
            ''
        )
    }

    if (slug === 'definition') {
        lines.push(
            'Define computed and unique attributes using Apache Velocity. For helper function details, see [Velocity context reference](../reference/velocity-context.md).',
            ''
        )
    }

    for (const item of menu.items || []) {
        if (item.type !== 'section') {
            continue
        }
        const sectionTitle = item.sectionTitle || menu.label
        lines.push(`## ${sectionTitle}`)
        lines.push('')
        const sectionGuide = USE_GUIDE_BY_SECTION[sectionTitle]
        if (sectionGuide) {
            lines.push(...renderGuideCallout(sectionGuide, 'Related guide'))
        }
        if (SECTION_INTRO_OVERRIDES[sectionTitle]) {
            lines.push(SECTION_INTRO_OVERRIDES[sectionTitle])
            lines.push('')
        } else if (item.sectionHelpMessage) {
            lines.push(htmlToMarkdown(item.sectionHelpMessage))
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
        '**How to use these pages**',
        '',
        '- **Here (Configuration reference):** descriptive field semantics — keys, types, defaults, conditionals, and allowed values.',
        '- **[Use guides](../use-guides/index.md):** didactic, scenario-driven walkthroughs with examples and tuning recipes.',
        '',
        'Each menu page links to its primary configuration guide. Use both together: start with a guide for context, then look up exact field behavior here.',
        '',
        '## Menus',
        '',
    ]

    /** @type {Record<string, string>} */
    const menuGuideTitles = {
        connection: 'Connection and observability tuning',
        source: 'Configuring sources and scope',
        mapping: 'Mapping attributes',
        definition: 'Defining attributes',
        matching: 'Matching identities',
        advanced: 'Connection and observability tuning',
    }

    for (const menu of menus) {
        const slug = MENU_SLUGS[menu.label]
        const guideTitle = menuGuideTitles[slug]
        const guidePath = USE_GUIDE_BY_MENU[menu.label]?.path.replace('../', '../') || ''
        if (guidePath) {
            lines.push(`- [${menu.label}](${slug}.md) — guide: [${guideTitle}](${guidePath})`)
        } else {
            lines.push(`- [${menu.label}](${slug}.md)`)
        }
    }

    lines.push('')
    lines.push('## Related references')
    lines.push('')
    lines.push('- [ISC PAT scopes](../reference/pat-scopes.md) — required API permissions for the connector PAT')
    lines.push('- [Config to account-list phases](../reference/config-to-phases.md) — map settings to aggregation log phases')
    lines.push('- [Velocity context](../reference/velocity-context.md) — helpers available in Define expressions')
    lines.push('- [Standard account schema](../reference/standard-account-schema.md) — Fusion account attribute schema')
    lines.push('- [Entitlement list](../operations/entitlement-list.md) — status and action entitlements exposed by the connector')
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






