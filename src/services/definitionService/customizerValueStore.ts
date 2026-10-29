import * as fs from 'fs'
import * as path from 'path'

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n
const FNV_PRIME_64 = 0x100000001b3n

/**
 * Calculates the 64-bit FNV-1a hash of a UTF-8 string, returned as a signed BigInt (int64).
 *
 * @param str - Input string to hash
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

export interface CustomizerStoreLoadResult {
    directory: string
    attributeCounts: Record<string, number>
    totalCount: number
    durationMs: number
    fileCount: number
}

/**
 * In-memory zero-heap binary search store for pre-compiled unique value indexes.
 */
export class CustomizerValueStore {
    private indices = new Map<string, BigInt64Array>()
    private directoryPath?: string
    private loadDurationMs = 0

    /**
     * Loads pre-compiled `.bin` index files from the specified directory.
     *
     * @param directoryPath - Path to the directory containing `.bin` index files
     * @returns Summary of loaded attributes and timings
     */
    load(directoryPath: string): CustomizerStoreLoadResult {
        const startTime = performance.now()
        this.directoryPath = directoryPath
        this.indices.clear()

        const attributeCounts: Record<string, number> = {}
        let totalCount = 0
        let fileCount = 0

        if (!fs.existsSync(directoryPath)) {
            const durationMs = Math.round((performance.now() - startTime) * 100) / 100
            this.loadDurationMs = durationMs
            return {
                directory: directoryPath,
                attributeCounts,
                totalCount: 0,
                durationMs,
                fileCount: 0,
            }
        }

        const files = fs.readdirSync(directoryPath).filter((f) => f.endsWith('.bin'))
        for (const file of files) {
            const attributeName = path.basename(file, '.bin')
            const fullPath = path.join(directoryPath, file)
            const buf = fs.readFileSync(fullPath)

            const alignedSlice = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
            const array = new BigInt64Array(alignedSlice)

            this.indices.set(attributeName, array)
            attributeCounts[attributeName] = array.length
            totalCount += array.length
            fileCount++
        }

        const durationMs = Math.round((performance.now() - startTime) * 100) / 100
        this.loadDurationMs = durationMs

        return {
            directory: directoryPath,
            attributeCounts,
            totalCount,
            durationMs,
            fileCount,
        }
    }

    /**
     * Checks if a candidate string value exists in the pre-compiled index for the given attribute.
     *
     * @param attributeName - Name of the unique attribute (e.g., 'sAMAccountName')
     * @param candidate - Candidate string value to check
     * @returns True if the value exists in the store, false otherwise
     */
    has(attributeName: string, candidate: string): boolean {
        const array = this.indices.get(attributeName)
        if (!array || array.length === 0) return false

        const target = fnv1a64(candidate)
        return this.binarySearch(array, target)
    }

    /**
     * Performs binary search over a sorted BigInt64Array.
     */
    private binarySearch(array: BigInt64Array, target: bigint): boolean {
        let low = 0
        let high = array.length - 1

        while (low <= high) {
            const mid = (low + high) >>> 1
            const midVal = array[mid]

            if (midVal === target) {
                return true
            }
            if (midVal < target) {
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        return false
    }

    /**
     * Returns all loaded attribute names.
     */
    getAttributeNames(): string[] {
        return Array.from(this.indices.keys())
    }

    /**
     * Returns the count of unique values loaded for a specific attribute.
     */
    getValueCount(attributeName: string): number {
        return this.indices.get(attributeName)?.length ?? 0
    }

    /**
     * Returns the total count of unique values across all loaded attributes.
     */
    getTotalValueCount(): number {
        let total = 0
        for (const array of this.indices.values()) {
            total += array.length
        }
        return total
    }

    /**
     * Returns the directory path from which indices were loaded.
     */
    getDirectory(): string | undefined {
        return this.directoryPath
    }

    /**
     * Returns the duration of the last load operation in milliseconds.
     */
    getDurationMs(): number {
        return this.loadDurationMs
    }

    /**
     * Returns true if any index files have been loaded.
     */
    isLoaded(): boolean {
        return this.indices.size > 0
    }
}
