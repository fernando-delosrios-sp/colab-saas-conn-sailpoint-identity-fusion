import * as path from 'path'
import * as fs from 'fs'
import { createConnectorCustomizer } from '@sailpoint/connector-sdk'

/**
 * Resolves the directory containing pre-compiled customizer index files.
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
 * SaaS Connectivity customizer entry point for Unique Values Customizer.
 */
export const connectorCustomizer = async () => {
    return createConnectorCustomizer().beforeStdAccountList(async (_context, input) => {
        const customizerIndicesDir = resolveDataDir()
        return {
            ...input,
            customizerIndicesDir,
        }
    })
}
