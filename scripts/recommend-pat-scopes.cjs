#!/usr/bin/env node
/**
 * Recommend ISC PAT scopes from an exported Fusion source config JSON.
 *
 * Usage:
 *   node scripts/recommend-pat-scopes.cjs path/to/source-config.json
 *   npm run pat-scopes:recommend -- path/to/source-config.json
 *
 * Accepts flat Fusion connector config objects or ISC exports with a
 * `connectorAttributes` array of { key, value } pairs.
 */

const fs = require('fs')
const path = require('path')

const CORE_MINIMUM = [
    'idn:accounts:manage',
    'sp:search:read',
    'idn:sources:manage',
    'idn:source-schema:manage',
]

const FULL_MINIMAL = [
    ...CORE_MINIMUM,
    'idn:accounts-state:manage',
    'sp:forms:manage',
    'sp:workflow:manage',
    'sp:workflow-execute:external',
    'idn:workgroup:read',
    'idn:task-management:read',
    'idn:identity-profile:manage',
    'idn:identity-profile-attribute:manage',
]

const CONDITIONAL = {
    'idn:accounts-state:manage': 'Orphan disable or delayed aggregation side effects',
    'idn:task-management:read': 'aggregationMode: before on any managed source',
    'sp:forms:manage': 'Match step enabled (matching rules configured)',
    'sp:workflow:manage': 'Review email notifications or delayed aggregation',
    'sp:workflow-execute:external': 'Review email notifications or delayed aggregation',
    'idn:workgroup:read': 'Global reviewers or Fusion source management workgroup',
    'idn:identity-profile:manage': 'correlationMode: reverse on any managed source',
    'idn:identity-profile-attribute:manage': 'correlationMode: reverse on any managed source',
}

function flattenConnectorAttributes(raw) {
    if (!raw || typeof raw !== 'object') {
        return {}
    }
    if (Array.isArray(raw.connectorAttributes)) {
        const flat = {}
        for (const entry of raw.connectorAttributes) {
            if (entry && entry.key != null) {
                flat[entry.key] = entry.value
            }
        }
        return flat
    }
    return raw
}

function parseSources(config) {
    const sources = config.sources
    if (Array.isArray(sources)) {
        return sources
    }
    if (typeof sources === 'string') {
        try {
            const parsed = JSON.parse(sources)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    return []
}

function matchEnabled(config) {
    const rules = config.matchingConfigs ?? config.fusionAttributeMatches
    if (Array.isArray(rules) && rules.length > 0) {
        return true
    }
    return config.fusionManualReviewScore != null && config.fusionManualReviewScore !== ''
}

function delayedAggregationEnabled(sources) {
    return sources.some((s) => s && s.aggregationMode === 'delayed')
}

function beforeAggregationEnabled(sources) {
    return sources.some((s) => s && s.aggregationMode === 'before')
}

function reverseCorrelationEnabled(sources) {
    return sources.some((s) => s && s.correlationMode === 'reverse')
}

function orphanDisableEnabled(sources) {
    return sources.some((s) => s && s.disableNonMatchingAccounts === true)
}

function workflowFeaturesEnabled(config, sources) {
    const reportEmail = config.fusionReportOnAggregation === true
    const matchReview = matchEnabled(config)
    return reportEmail || matchReview || delayedAggregationEnabled(sources)
}

function globalReviewerEnabled(config) {
    return config.fusionOwnerIsGlobalReviewer === true || config.ownersAreGlobalReviewers === true
}

function recommend(configPath) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const config = flattenConnectorAttributes(raw)
    const sources = parseSources(config)

    const conditional = new Set()
    const reasons = []

    if (orphanDisableEnabled(sources) || delayedAggregationEnabled(sources)) {
        conditional.add('idn:accounts-state:manage')
        reasons.push(['idn:accounts-state:manage', CONDITIONAL['idn:accounts-state:manage']])
    }
    if (beforeAggregationEnabled(sources)) {
        conditional.add('idn:task-management:read')
        reasons.push(['idn:task-management:read', CONDITIONAL['idn:task-management:read']])
    }
    if (matchEnabled(config)) {
        conditional.add('sp:forms:manage')
        reasons.push(['sp:forms:manage', CONDITIONAL['sp:forms:manage']])
    }
    if (workflowFeaturesEnabled(config, sources)) {
        conditional.add('sp:workflow:manage')
        conditional.add('sp:workflow-execute:external')
        reasons.push(['sp:workflow:manage', CONDITIONAL['sp:workflow:manage']])
        reasons.push(['sp:workflow-execute:external', CONDITIONAL['sp:workflow-execute:external']])
    }
    if (globalReviewerEnabled(config)) {
        conditional.add('idn:workgroup:read')
        reasons.push(['idn:workgroup:read', CONDITIONAL['idn:workgroup:read']])
    }
    if (reverseCorrelationEnabled(sources)) {
        conditional.add('idn:identity-profile:manage')
        conditional.add('idn:identity-profile-attribute:manage')
        reasons.push(['idn:identity-profile:manage', CONDITIONAL['idn:identity-profile:manage']])
        reasons.push(['idn:identity-profile-attribute:manage', CONDITIONAL['idn:identity-profile-attribute:manage']])
    }

    const mapDefineOnly =
        !matchEnabled(config) &&
        !delayedAggregationEnabled(sources) &&
        !beforeAggregationEnabled(sources) &&
        !reverseCorrelationEnabled(sources) &&
        !orphanDisableEnabled(sources) &&
        !globalReviewerEnabled(config)

    const recommended = mapDefineOnly
        ? [...CORE_MINIMUM]
        : [...new Set([...FULL_MINIMAL, ...conditional])].sort()

    return { configPath, mapDefineOnly, recommended, conditional: [...conditional].sort(), reasons }
}

function main() {
    const configPath = process.argv[2]
    if (!configPath) {
        console.error('Usage: node scripts/recommend-pat-scopes.cjs <source-config.json>')
        process.exit(1)
    }
    const resolved = path.resolve(configPath)
    if (!fs.existsSync(resolved)) {
        console.error(`File not found: ${resolved}`)
        process.exit(1)
    }

    const result = recommend(resolved)

    console.log(`# PAT scope recommendation for ${path.basename(resolved)}`)
    console.log('')
    if (result.mapDefineOnly) {
        console.log('Deployment pattern: Map/Define side-car (core minimum)')
    } else {
        console.log('Deployment pattern: Match or extended features (full minimal + conditional)')
    }
    console.log('')
    console.log('## Recommended scopes')
    console.log('')
    for (const scope of result.recommended) {
        console.log(scope)
    }
    if (result.reasons.length > 0) {
        console.log('')
        console.log('## Conditional scopes detected')
        console.log('')
        const seen = new Set()
        for (const [scope, reason] of result.reasons) {
            if (seen.has(scope)) continue
            seen.add(scope)
            console.log(`- \`${scope}\` — ${reason}`)
        }
    }
    console.log('')
    console.log('See docs/reference/pat-scopes.md for scope-by-scope rationale.')
}

main()
