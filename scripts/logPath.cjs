/**
 * Keep in sync with src/services/logService/fileLogSink.ts and src/utils/url.ts (tenantSlugFromBaseurl).
 */
const path = require('path')

const UNKNOWN_TENANT_SLUG = 'unknown-tenant'
const FUSION_BASEURL_HEADER = 'x-fusion-baseurl'

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

/** LOG_FILE env or logs/<tenant>/fusion-{YYYYMMDD}.log */
function isDeprecatedIngestLogPath(filePath) {
    return path.normalize(filePath).endsWith(path.join('logs', 'proxy-ingest.log'))
}

function resolveLogFilePath(baseurl, now = new Date()) {
    const logFileOverride = process.env.LOG_FILE
    if (logFileOverride && !isDeprecatedIngestLogPath(logFileOverride)) {
        return logFileOverride
    }
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const tenant = tenantSlugFromBaseurl(baseurl)
    return path.join('logs', tenant, `fusion-${y}${m}${d}.log`)
}

module.exports = {
    FUSION_BASEURL_HEADER,
    UNKNOWN_TENANT_SLUG,
    tenantSlugFromBaseurl,
    isDeprecatedIngestLogPath,
    resolveLogFilePath,
}
