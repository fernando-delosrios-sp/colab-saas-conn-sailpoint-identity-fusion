import * as path from 'path'
import { tenantSlugFromBaseurl } from '../utils/url'

/** Root directory for record/replay chain artifacts (repo-relative: `./recordings`). */
export const RECORDINGS_DIR = path.resolve('recordings')

/** Cache/lifecycle key scoped by tenant and chain name. */
export function recordingCacheKey(chainName: string, baseurl?: string): string {
    return `${tenantSlugFromBaseurl(baseurl)}/${chainName}`
}

/** Absolute path to a named chain directory under recordings/<tenant>/. */
export function recordingChainDir(chainName: string, baseurl?: string): string {
    return path.join(RECORDINGS_DIR, tenantSlugFromBaseurl(baseurl), chainName)
}

/** Repo-relative path to a named chain directory (for manifests and scenario.json). */
export function recordingChainDirRelative(chainName: string, baseurl?: string): string {
    return path.join('recordings', tenantSlugFromBaseurl(baseurl), chainName)
}

