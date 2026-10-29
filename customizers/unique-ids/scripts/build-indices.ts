import * as fs from 'fs'
import * as path from 'path'

export const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n
export const FNV_PRIME_64 = 0x100000001b3n

/**
 * Calculates the 64-bit FNV-1a hash of a UTF-8 string, returned as a signed BigInt (int64).
 *
 * @param str - Input string
 * @returns 64-bit signed BigInt representation
 */
export function fnv1a64(str: string): bigint {
    let hash = FNV_OFFSET_BASIS_64
    const buf = Buffer.from(str, 'utf-8')
    for (let i = 0; i < buf.length; i++) {
        hash ^= BigInt(buf[i])
        hash = BigInt.asUintN(64, hash * FNV_PRIME_64)
    }
    return BigInt.asIntN(64, hash)
}

export interface BuildIndicesOptions {
    valuesDir?: string
    outputDir?: string
    logger?: {
        info: (msg: string) => void
        warn: (msg: string) => void
        error: (msg: string) => void
    }
}

export interface BuildIndexResult {
    attributeName: string
    sourceFile: string
    outputFile: string
    indexedCount: number
}

/**
 * Compiles a single CSV file into a sorted 64-bit binary index file.
 *
 * @param csvPath - Path to the CSV file
 * @param outputDir - Destination directory for the .bin file
 * @param logger - Optional logging interface
 * @returns BuildIndexResult
 */
export function buildIndexForFile(
    csvPath: string,
    outputDir: string,
    logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void } = console
): BuildIndexResult {
    const attributeName = path.basename(csvPath, '.csv')
    const content = fs.readFileSync(csvPath, 'utf-8')
    const lines = content.split(/\r?\n/)

    const uniqueHashes = new Set<bigint>()
    for (const rawLine of lines) {
        const trimmed = rawLine.trim()
        if (trimmed.length === 0) continue
        uniqueHashes.add(fnv1a64(trimmed))
    }

    const sortedHashes = Array.from(uniqueHashes).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputFile = path.join(outputDir, `${attributeName}.bin`)
    const array = new BigInt64Array(sortedHashes)
    const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
    fs.writeFileSync(outputFile, buffer)

    logger.info(`Indexed ${sortedHashes.length} values for attribute '${attributeName}' -> ${outputFile}`)

    return {
        attributeName,
        sourceFile: csvPath,
        outputFile,
        indexedCount: sortedHashes.length,
    }
}

/**
 * Compiles all .csv files from valuesDir into .bin index files in outputDir.
 *
 * @param options - Build configuration options
 * @returns Array of compilation results
 */
export function buildIndices(options: BuildIndicesOptions = {}): BuildIndexResult[] {
    const valuesDir = options.valuesDir ?? path.resolve(__dirname, '../values')
    const outputDir = options.outputDir ?? path.resolve(__dirname, '../data')
    const logger = options.logger ?? console

    if (!fs.existsSync(valuesDir)) {
        logger.info(`Values directory does not exist: ${valuesDir}. Skipping index build.`)
        return []
    }

    const files = fs.readdirSync(valuesDir).filter((file) => file.endsWith('.csv'))
    const results: BuildIndexResult[] = []

    for (const file of files) {
        const csvPath = path.join(valuesDir, file)
        const result = buildIndexForFile(csvPath, outputDir, logger)
        results.push(result)
    }

    return results
}

// Execute if run directly
if (
    typeof require !== 'undefined' &&
    require.main === module
) {
    buildIndices()
} else if (
    typeof process !== 'undefined' &&
    process.argv[1] &&
    path.basename(process.argv[1]).includes('build-indices')
) {
    buildIndices()
}
