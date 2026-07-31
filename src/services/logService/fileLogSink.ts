import fs from 'fs/promises'
import path from 'path'
import { tenantSlugFromBaseurl } from '../../utils/url'

/** Request header carrying ISC baseurl for tenant-scoped log ingest on the proxy server. */
export const FUSION_BASEURL_HEADER = 'x-fusion-baseurl'

/**
 * Strip newlines and control characters to prevent log injection.
 * Logic ported from log-server.js sanitizeLog.
 */
export function sanitizeLogMessage(message: unknown): string {
    let text: string
    if (typeof message !== 'string') {
        try {
            text = JSON.stringify(message)
        } catch {
            text = String(message)
        }
    } else {
        text = message
    }
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\x00-\x08\x0A-\x1F\x7F\u0085\u2028\u2029]+/g, ' ')
}

/** @deprecated flat ingest path from an earlier proxy-server wrapper; use tenant-scoped default instead */
export function isDeprecatedIngestLogPath(filePath: string): boolean {
    return path.normalize(filePath).endsWith(path.join('logs', 'proxy-ingest.log'))
}

/** Resolves the disk log path: LOG_FILE env or logs/<tenant>/fusion-{YYYYMMDD}.log */
export function resolveLogFilePath(baseurl?: string, now: Date = new Date()): string {
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

/** Appends a sanitized plain-text log line to the resolved log file. */
export async function appendLogLine(message: string, baseurl?: string, now: Date = new Date()): Promise<void> {
    const sanitized = sanitizeLogMessage(message)
    const logFile = resolveLogFilePath(baseurl, now)
    await fs.mkdir(path.dirname(logFile), { recursive: true })
    await fs.appendFile(logFile, `${sanitized}\n`)
}


