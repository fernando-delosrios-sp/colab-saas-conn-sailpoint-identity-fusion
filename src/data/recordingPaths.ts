import * as path from 'path'
import { tenantSlugFromBaseurl } from '../utils/url'

/** Root directory for record/replay chain artifacts (repo-relative: `./recordings`). */
export const RECORDINGS_DIR = path.resolve('recordings')

export type ParsedRecordingChainRef = {
    tenant: string
    chainName: string
    /** Normalized `tenant/chainName` reference. */
    chainRef: string
}

/** Sanitize a single tenant or chain segment for filesystem use. */
export function sanitizeRecordingSegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

export function normalizeChainRefInput(chainRef: string): string {
    return chainRef.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
}

/**
 * Parses a chain reference: `tenant/chainName` or bare `chainName` (tenant from baseurl).
 */
export function parseRecordingChainRef(chainRef: string, baseurl?: string): ParsedRecordingChainRef {
    const trimmed = normalizeChainRefInput(chainRef)
    if (!trimmed) {
        throw new Error('Invalid chain reference: empty value')
    }
    if (trimmed.endsWith('/')) {
        throw new Error(
            `Invalid chain reference: "${chainRef}" — chain name is missing after "/". ` +
                'Use tenant/chain (e.g. company12926-poc/fernando).'
        )
    }
    const slash = trimmed.indexOf('/')
    if (slash !== -1) {
        const tenant = sanitizeRecordingSegment(trimmed.slice(0, slash))
        const chainName = sanitizeRecordingSegment(trimmed.slice(slash + 1))
        if (!tenant || !chainName) {
            throw new Error(`Invalid chain reference: "${chainRef}". Use tenant/chain (e.g. company12926-poc/fernando).`)
        }
        return { tenant, chainName, chainRef: `${tenant}/${chainName}` }
    }
    const tenant = tenantSlugFromBaseurl(baseurl)
    const chainName = sanitizeRecordingSegment(trimmed)
    if (!chainName) {
        throw new Error(`Invalid chain reference: ${chainRef}`)
    }
    return { tenant, chainName, chainRef: `${tenant}/${chainName}` }
}

/** Cache/lifecycle key scoped by tenant and chain name (`tenant/chainName`). */
export function recordingCacheKey(chainRef: string, baseurl?: string): string {
    return parseRecordingChainRef(chainRef, baseurl).chainRef
}

/** Absolute path to a named chain directory under recordings/<tenant>/. */
export function recordingChainDir(chainRef: string, baseurl?: string): string {
    const { tenant, chainName } = parseRecordingChainRef(chainRef, baseurl)
    return path.join(RECORDINGS_DIR, tenant, chainName)
}

/** Repo-relative path to a named chain directory (for manifests and scenario.json). */
export function recordingChainDirRelative(chainRef: string, baseurl?: string): string {
    const { tenant, chainName } = parseRecordingChainRef(chainRef, baseurl)
    return path.join('recordings', tenant, chainName)
}
