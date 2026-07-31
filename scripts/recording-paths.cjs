const path = require('path')

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

function resolveTenantSlug(baseurl) {
    return tenantSlugFromBaseurl(baseurl ?? process.env.BASEURL ?? process.env.ISC_BASEURL)
}

function chainDir(chainName, baseurl) {
    return path.join(RECORDINGS_ROOT, resolveTenantSlug(baseurl), chainName)
}

function listTenantChainDirs() {
    if (!fsExists(RECORDINGS_ROOT)) return []

    const results = []
    for (const tenantEntry of readdirSafe(RECORDINGS_ROOT)) {
        if (!tenantEntry.isDirectory()) continue
        const tenantDir = path.join(RECORDINGS_ROOT, tenantEntry.name)
        for (const chainEntry of readdirSafe(tenantDir)) {
            if (!chainEntry.isDirectory()) continue
            const chainDirPath = path.join(tenantDir, chainEntry.name)
            const scenario = path.join(chainDirPath, 'scenario.json')
            const steps = path.join(chainDirPath, 'steps.ndjson')
            if (fsExists(scenario) || fsExists(steps)) {
                results.push({
                    tenant: tenantEntry.name,
                    chainName: chainEntry.name,
                    dir: chainDirPath,
                })
            }
        }
    }
    return results
}

function fsExists(filePath) {
    try {
        const fs = require('fs')
        return fs.existsSync(filePath)
    } catch {
        return false
    }
}

function readdirSafe(dir) {
    try {
        const fs = require('fs')
        return fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return []
    }
}

module.exports = {
    RECORDINGS_ROOT,
    UNKNOWN_TENANT_SLUG,
    tenantSlugFromBaseurl,
    resolveTenantSlug,
    chainDir,
    listTenantChainDirs,
}
