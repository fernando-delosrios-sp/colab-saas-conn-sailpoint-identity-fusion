const path = require('path')
const fs = require('fs')

const RECORDINGS_ROOT = path.resolve('recordings')
const UNKNOWN_TENANT_SLUG = 'unknown-tenant'

function tenantSlugFromBaseurl(baseurl) {
    if (!baseurl || typeof baseurl !== 'string' || !baseurl.trim()) {
        return UNKNOWN_TENANT_SLUG
    }
    try {
        let host = new URL(baseurl.trim()).hostname
        if (host.startsWith('[') && host.endsWith(']')) {
            host = host.slice(1, -1)
        }
        let segment
        if (host.includes(':')) {
            segment = host.replace(/[^a-fA-F0-9:._-]+/g, '_').replace(/:/g, '_')
        } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
            segment = host.replace(/\./g, '_')
        } else {
            const dot = host.indexOf('.')
            segment = dot === -1 ? host : host.slice(0, dot)
        }
        const safe = segment.replace(/[^a-zA-Z0-9._-]+/g, '_')
        return safe.length > 0 ? safe : UNKNOWN_TENANT_SLUG
    } catch {
        return UNKNOWN_TENANT_SLUG
    }
}

function sanitizeRecordingSegment(segment) {
    return segment.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

function normalizeScenarioRefInput(scenarioRef) {
    return String(scenarioRef ?? '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
}

/** @deprecated Use normalizeScenarioRefInput. */
function normalizeChainRefInput(chainRef) {
    return normalizeScenarioRefInput(chainRef)
}

function parseRecordingScenarioRef(scenarioRef, baseurl) {
    const trimmed = normalizeScenarioRefInput(scenarioRef)
    if (!trimmed) {
        throw new Error('Invalid scenario reference: empty value')
    }
    if (trimmed.endsWith('/')) {
        throw new Error(
            `Invalid scenario reference: "${scenarioRef}" — scenario name is missing after "/". ` +
                'Use tenant/scenario (e.g. company12926-poc/fernando). ' +
                'Quote the reference in your shell: npm run test-recording -- "company12926-poc/fernando"'
        )
    }
    const slash = trimmed.indexOf('/')
    if (slash !== -1) {
        const tenant = sanitizeRecordingSegment(trimmed.slice(0, slash))
        const scenarioName = sanitizeRecordingSegment(trimmed.slice(slash + 1))
        if (!tenant || !scenarioName) {
            throw new Error(
                `Invalid scenario reference: "${scenarioRef}". Use tenant/scenario (e.g. company12926-poc/fernando).`
            )
        }
        return { tenant, scenarioName, scenarioRef: `${tenant}/${scenarioName}` }
    }
    const tenant = tenantSlugFromBaseurl(baseurl ?? process.env.BASEURL ?? process.env.ISC_BASEURL)
    const scenarioName = sanitizeRecordingSegment(trimmed)
    if (!scenarioName) {
        throw new Error(`Invalid scenario reference: "${scenarioRef}"`)
    }
    return { tenant, scenarioName, scenarioRef: `${tenant}/${scenarioName}` }
}

/** @deprecated Use parseRecordingScenarioRef. */
function parseRecordingChainRef(chainRef, baseurl) {
    const parsed = parseRecordingScenarioRef(chainRef, baseurl)
    return {
        ...parsed,
        chainName: parsed.scenarioName,
        chainRef: parsed.scenarioRef,
    }
}

/** Join argv parts so `tenant` + `scenario` or shell-split refs still resolve. */
function resolveScenarioRefFromArgv(argv, argIndex = 2) {
    const parts = argv.slice(argIndex).filter((part) => part !== undefined && String(part).trim() !== '')
    if (parts.length === 0) {
        return ''
    }
    return parts.join('/').trim()
}

/** @deprecated Use resolveScenarioRefFromArgv. */
function resolveChainRefFromArgv(argv, argIndex = 2) {
    return resolveScenarioRefFromArgv(argv, argIndex)
}

function scenarioDir(scenarioRef, baseurl) {
    const { tenant, scenarioName } = parseRecordingScenarioRef(scenarioRef, baseurl)
    return path.join(RECORDINGS_ROOT, tenant, scenarioName)
}

/** @deprecated Use scenarioDir. */
function chainDir(chainRef, baseurl) {
    return scenarioDir(chainRef, baseurl)
}

function listTenantScenarioDirs() {
    if (!fs.existsSync(RECORDINGS_ROOT)) return []

    const results = []
    for (const tenantEntry of fs.readdirSync(RECORDINGS_ROOT, { withFileTypes: true })) {
        if (!tenantEntry.isDirectory()) continue
        const tenantDir = path.join(RECORDINGS_ROOT, tenantEntry.name)
        for (const scenarioEntry of fs.readdirSync(tenantDir, { withFileTypes: true })) {
            if (!scenarioEntry.isDirectory()) continue
            const scenarioDirPath = path.join(tenantDir, scenarioEntry.name)
            const scenario = path.join(scenarioDirPath, 'scenario.json')
            const steps = path.join(scenarioDirPath, 'steps.ndjson')
            const apiLog = path.join(scenarioDirPath, 'api-log.ndjson')
            if (fs.existsSync(scenario) || fs.existsSync(steps) || fs.existsSync(apiLog)) {
                results.push({
                    tenant: tenantEntry.name,
                    scenarioName: scenarioEntry.name,
                    scenarioRef: `${tenantEntry.name}/${scenarioEntry.name}`,
                    chainName: scenarioEntry.name,
                    chainRef: `${tenantEntry.name}/${scenarioEntry.name}`,
                    dir: scenarioDirPath,
                })
            }
        }
    }
    return results
}

/** @deprecated Use listTenantScenarioDirs. */
function listTenantChainDirs() {
    return listTenantScenarioDirs()
}

function listScenariosWithApiLog() {
    return listTenantScenarioDirs()
        .filter((entry) => {
            const apiLog = path.join(entry.dir, 'api-log.ndjson')
            if (!fs.existsSync(apiLog)) return false
            const content = fs.readFileSync(apiLog, 'utf-8').trim()
            return content.length > 0
        })
        .map((entry) => entry.scenarioRef)
        .sort()
}

/** @deprecated Use listScenariosWithApiLog. */
function listChainsWithApiLog() {
    return listScenariosWithApiLog()
}

module.exports = {
    RECORDINGS_ROOT,
    UNKNOWN_TENANT_SLUG,
    tenantSlugFromBaseurl,
    sanitizeRecordingSegment,
    normalizeScenarioRefInput,
    normalizeChainRefInput,
    parseRecordingScenarioRef,
    parseRecordingChainRef,
    resolveScenarioRefFromArgv,
    resolveChainRefFromArgv,
    scenarioDir,
    chainDir,
    listTenantScenarioDirs,
    listTenantChainDirs,
    listScenariosWithApiLog,
    listChainsWithApiLog,
}
