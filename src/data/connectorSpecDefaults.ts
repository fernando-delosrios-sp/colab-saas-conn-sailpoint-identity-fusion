import { existsSync, readFileSync } from 'fs'
import * as path from 'path'

let cachedFusionMaxCandidatesForForm: number | undefined

type ConnectorSpecShape = {
    sourceConfigInitialValues?: { fusionMaxCandidatesForForm?: number }
}

/**
 * Default for `fusionMaxCandidatesForForm` when absent from resolved runtime config.
 * Read from `connector-spec.json` → `sourceConfigInitialValues` (single source of truth for new sources).
 */
export function defaultFusionMaxCandidatesForForm(): number {
    if (cachedFusionMaxCandidatesForForm !== undefined) {
        return cachedFusionMaxCandidatesForForm
    }

    const candidates = [
        path.join(process.cwd(), 'connector-spec.json'),
        path.join(__dirname, '..', '..', 'connector-spec.json'),
        path.join(__dirname, '..', 'connector-spec.json'),
    ]

    for (const specPath of candidates) {
        if (!existsSync(specPath)) continue
        try {
            const parsed = JSON.parse(readFileSync(specPath, 'utf8')) as ConnectorSpecShape
            const v = parsed.sourceConfigInitialValues?.fusionMaxCandidatesForForm
            if (typeof v === 'number' && Number.isFinite(v)) {
                cachedFusionMaxCandidatesForForm = Math.trunc(v)
                return cachedFusionMaxCandidatesForForm
            }
        } catch {
            /* try next candidate */
        }
    }

    cachedFusionMaxCandidatesForForm = 3
    return cachedFusionMaxCandidatesForForm
}
