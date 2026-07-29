import * as path from 'path'

/** Root directory for record/replay chain artifacts (repo-relative: `./recordings`). */
export const RECORDINGS_DIR = path.resolve('recordings')

/** Absolute path to a named chain directory. */
export function recordingChainDir(chainName: string): string {
    return path.join(RECORDINGS_DIR, chainName)
}

/** Repo-relative path to a named chain directory (for manifests and scenario.json). */
export function recordingChainDirRelative(chainName: string): string {
    return path.join('recordings', chainName)
}
