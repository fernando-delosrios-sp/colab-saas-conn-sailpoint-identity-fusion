import fs from 'fs'
import path from 'path'

/** Loads `.env` into process.env without overriding existing variables. */
export function loadDotEnv(cwd = process.cwd()): void {
    const envPath = path.join(cwd, '.env')
    if (!fs.existsSync(envPath)) {
        return
    }
    for (const line of fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
            continue
        }
        const eq = trimmed.indexOf('=')
        if (eq === -1) {
            continue
        }
        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }
        if (process.env[key] === undefined) {
            process.env[key] = value
        }
    }
}
