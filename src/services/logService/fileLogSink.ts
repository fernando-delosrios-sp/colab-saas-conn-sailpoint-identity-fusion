import fs from 'fs/promises'
import path from 'path'

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

/** Resolves the disk log path: LOG_FILE env or logs/fusion-{YYYYMMDD}.log */
export function resolveLogFilePath(now: Date = new Date()): string {
    if (process.env.LOG_FILE) {
        return process.env.LOG_FILE
    }
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `logs/fusion-${y}${m}${d}.log`
}

/** Appends a sanitized plain-text log line to the resolved log file. */
export async function appendLogLine(message: string, now: Date = new Date()): Promise<void> {
    const sanitized = sanitizeLogMessage(message)
    const logFile = resolveLogFilePath(now)
    await fs.mkdir(path.dirname(logFile), { recursive: true })
    await fs.appendFile(logFile, `${sanitized}\n`)
}
