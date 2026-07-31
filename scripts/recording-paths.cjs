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

function normalizeChainRefInput(chainRef) {
    return String(chainRef ?? '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
}

function parseRecordingChainRef(chainRef, baseurl) {
    const trimmed = normalizeChainRefInput(chainRef)
    if (!trimmed) {
        throw new Error('Invalid chain reference: empty value')
    }
    if (trimmed.endsWith('/')) {
        throw new Error(
            `Invalid chain reference: "${chainRef}" — chain name is missing after "/". ` +
                'Use tenant/chain (e.g. company12926-poc/fernando). ' +
                'Quote the reference in your shell: npm run test-recording -- "company12926-poc/fernando"'
        )
    }
    const slash = trimmed.indexOf('/')
    if (slash !== -1) {
        const tenant = sanitizeRecordingSegment(trimmed.slice(0, slash))
        const chainName = sanitizeRecordingSegment(trimmed.slice(slash + 1))
        if (!tenant || !chainName) {
            throw new Error(
                `Invalid chain reference: "${chainRef}". Use tenant/chain (e.g. company12926-poc/fernando).`
            )
        }
        return { tenant, chainName, chainRef: `${tenant}/${chainName}` }
    }
    const tenant = tenantSlugFromBaseurl(baseurl ?? process.env.BASEURL ?? process.env.ISC_BASEURL)
    const chainName = sanitizeRecordingSegment(trimmed)
    if (!chainName) {
        throw new Error(`Invalid chain reference: "${chainRef}"`)
    }
    return { tenant, chainName, chainRef: `${tenant}/${chainName}` }
}

/** Join argv parts so `tenant` + `chain` or shell-split refs still resolve. */
function resolveChainRefFromArgv(argv, argIndex = 2) {
    const parts = argv.slice(argIndex).filter((part) => part !== undefined && String(part).trim() !== '')
    if (parts.length === 0) {
        return ''
    }
    return parts.join('/').trim()
}

function chainDir(chainRef, baseurl) {
    const { tenant, chainName } = parseRecordingChainRef(chainRef, baseurl)
    return path.join(RECORDINGS_ROOT, tenant, chainName)
}

function listTenantChainDirs() {
    if (!fs.existsSync(RECORDINGS_ROOT)) return []

    const results = []
    for (const tenantEntry of fs.readdirSync(RECORDINGS_ROOT, { withFileTypes: true })) {
        if (!tenantEntry.isDirectory()) continue
        const tenantDir = path.join(RECORDINGS_ROOT, tenantEntry.name)
        for (const chainEntry of fs.readdirSync(tenantDir, { withFileTypes: true })) {
            if (!chainEntry.isDirectory()) continue
            const chainDirPath = path.join(tenantDir, chainEntry.name)
            const scenario = path.join(chainDirPath, 'scenario.json')
            const steps = path.join(chainDirPath, 'steps.ndjson')
            const apiLog = path.join(chainDirPath, 'api-log.ndjson')
            if (fs.existsSync(scenario) || fs.existsSync(steps) || fs.existsSync(apiLog)) {
                results.push({
                    tenant: tenantEntry.name,
                    chainName: chainEntry.name,
                    chainRef: `${tenantEntry.name}/${chainEntry.name}`,
                    dir: chainDirPath,
                })
            }
        }
    }
    return results
}

function listChainsWithApiLog() {
    return listTenantChainDirs()
        .filter((entry) => {
            const apiLog = path.join(entry.dir, 'api-log.ndjson')
            if (!fs.existsSync(apiLog)) return false
            const content = fs.readFileSync(apiLog, 'utf-8').trim()
            return content.length > 0
        })
        .map((entry) => entry.chainRef)
        .sort()
}

module.exports = {
    RECORDINGS_ROOT,
    UNKNOWN_TENANT_SLUG,
    tenantSlugFromBaseurl,
    sanitizeRecordingSegment,
    parseRecordingChainRef,
    resolveChainRefFromArgv,
    chainDir,
    listTenantChainDirs,
    listChainsWithApiLog,
}
