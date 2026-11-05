import * as path from 'path'
import * as fs from 'fs'
import { createConnectorCustomizer } from '@sailpoint/connector-sdk'

/**
 * Resolves the customizer data directory.
 *
 * @param baseDir - Directory relative to which data/ is located (defaults to __dirname)
 * @returns Absolute path to data/ directory
 */
export function resolveDataDir(baseDir: string = __dirname): string {
    const directCandidate = path.resolve(baseDir, 'data')
    if (fs.existsSync(directCandidate)) return directCandidate

    const parentCandidate = path.resolve(baseDir, '../data')
    if (fs.existsSync(parentCandidate)) return parentCandidate

    return directCandidate
}

/**
 * Resolves the packaged internal-record directory when a manifest is present.
 *
 * @param baseDir - Directory relative to which data/ is located
 * @returns Absolute internal-record directory, or undefined when the package has no dumps
 */
export function resolveInternalRecordsDir(baseDir: string = __dirname): string | undefined {
    const dataDir = resolveDataDir(baseDir)
    const candidate = path.resolve(dataDir, 'internal-records')
    return fs.existsSync(path.join(candidate, 'manifest.json')) ? candidate : undefined
}

/**
 * SaaS Connectivity customizer entry point for Records Customizer.
 * Returns the packaged Internal Record directory (configuration, manifest, and shards)
 * and does not return a unique-value index directory.
 */
export const connectorCustomizer = async () => {
    return createConnectorCustomizer().beforeStdAccountList(async (_context, input) => {
        const customizerInternalRecordsDir = resolveInternalRecordsDir()
        return {
            ...input,
            ...(customizerInternalRecordsDir ? { customizerInternalRecordsDir } : {}),
        }
    })
}
