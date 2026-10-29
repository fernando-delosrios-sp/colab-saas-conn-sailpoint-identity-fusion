import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
    buildIndexForFile,
    buildIndices,
    fnv1a64,
} from '../scripts/build-indices'
import { connectorCustomizer, resolveDataDir } from '../src/index'

describe('Unique Values Customizer', () => {
    let tempDir: string
    let valuesDir: string
    let outputDir: string

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'customizer-test-'))
        valuesDir = path.join(tempDir, 'values')
        outputDir = path.join(tempDir, 'data')
        fs.mkdirSync(valuesDir, { recursive: true })
    })

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    })

    describe('64-bit FNV-1a hashing', () => {
        it('produces consistent 64-bit signed BigInt values', () => {
            const h1 = fnv1a64('admin')
            const h2 = fnv1a64('admin')
            const h3 = fnv1a64('root')
            expect(h1).toBe(h2)
            expect(h1).not.toBe(h3)
            expect(typeof h1).toBe('bigint')
        })

        it('is case-sensitive', () => {
            const lower = fnv1a64('jdoe')
            const upper = fnv1a64('JDOE')
            expect(lower).not.toBe(upper)
        })
    })

    describe('Scenario: Single-column CSV compiled to sorted 64-bit binary hash file', () => {
        it('compiles non-empty trimmed lines into deduplicated, sorted 64-bit binary index', () => {
            const csvPath = path.join(valuesDir, 'sAMAccountName.csv')
            fs.writeFileSync(
                csvPath,
                'charlie\n' +
                'alice\n' +
                'bob\n' +
                'alice\n' + // duplicate
                '  bob  \n' + // whitespace duplicate
                '\n' + // empty line
                '   \n' // whitespace line
            )

            const result = buildIndexForFile(csvPath, outputDir)
            expect(result.attributeName).toBe('sAMAccountName')
            expect(result.indexedCount).toBe(3)
            expect(fs.existsSync(result.outputFile)).toBe(true)

            // Read the binary file and verify 8-byte integers
            const binBuffer = fs.readFileSync(result.outputFile)
            expect(binBuffer.length).toBe(3 * 8)

            const alignedSlice = binBuffer.buffer.slice(
                binBuffer.byteOffset,
                binBuffer.byteOffset + binBuffer.byteLength
            )
            const array = new BigInt64Array(alignedSlice)
            expect(array.length).toBe(3)

            // Verify sorted order
            expect(array[0] <= array[1]).toBe(true)
            expect(array[1] <= array[2]).toBe(true)

            // Verify all expected hashes are present in the array
            const expectedHashes = [
                fnv1a64('alice'),
                fnv1a64('bob'),
                fnv1a64('charlie'),
            ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

            expect(Array.from(array)).toEqual(expectedHashes)
        })
    })

    describe('Scenario: Empty or whitespace-only CSV handled gracefully', () => {
        it('produces an empty .bin file with 0 values indexed without error', () => {
            const csvPath = path.join(valuesDir, 'employeeNumber.csv')
            fs.writeFileSync(csvPath, '   \n\n  \t  \n')

            const logs: string[] = []
            const logger = {
                info: (msg: string) => logs.push(msg),
                warn: (msg: string) => logs.push(msg),
                error: (msg: string) => logs.push(msg),
            }

            const result = buildIndexForFile(csvPath, outputDir, logger)
            expect(result.attributeName).toBe('employeeNumber')
            expect(result.indexedCount).toBe(0)
            expect(fs.existsSync(result.outputFile)).toBe(true)

            const binBuffer = fs.readFileSync(result.outputFile)
            expect(binBuffer.length).toBe(0)
            expect(logs.some((l) => l.includes('Indexed 0 values for attribute \'employeeNumber\''))).toBe(true)
        })
    })

    describe('buildIndices directory runner', () => {
        it('processes all .csv files and skips non-csv files', () => {
            fs.writeFileSync(path.join(valuesDir, 'attr1.csv'), 'val1\nval2\n')
            fs.writeFileSync(path.join(valuesDir, 'attr2.csv'), 'val3\n')
            fs.writeFileSync(path.join(valuesDir, 'notes.txt'), 'ignore me\n')

            const results = buildIndices({ valuesDir, outputDir })
            expect(results.length).toBe(2)
            expect(results.map((r) => r.attributeName).sort()).toEqual(['attr1', 'attr2'])
            expect(fs.existsSync(path.join(outputDir, 'attr1.bin'))).toBe(true)
            expect(fs.existsSync(path.join(outputDir, 'attr2.bin'))).toBe(true)
            expect(fs.existsSync(path.join(outputDir, 'notes.bin'))).toBe(false)
        })

        it('handles non-existent values directory gracefully', () => {
            const missingDir = path.join(tempDir, 'does-not-exist')
            const results = buildIndices({ valuesDir: missingDir, outputDir })
            expect(results).toEqual([])
        })
    })

    describe('Scenario: Customizer hook provides directory path', () => {
        it('resolves data directory and returns customizerIndicesDir in input', async () => {
            const customizerInstance = await connectorCustomizer()
            expect(customizerInstance).toBeDefined()

            const mockInput = { filter: 'test' }
            const mockContext = {} as any

            // The SDK customizer executes the before handler via _exec with 'before:<commandType>'
            const result = await customizerInstance._exec('before:std:account:list', mockContext, mockInput)
            expect(result).toBeDefined()
            expect(result.filter).toBe('test')
            expect(typeof result.customizerIndicesDir).toBe('string')
            expect(result.customizerIndicesDir.length).toBeGreaterThan(0)
        })

        it('resolveDataDir prioritizes existing data directory', () => {
            const mockBase = path.join(tempDir, 'customizer-root')
            const directData = path.join(mockBase, 'data')
            fs.mkdirSync(directData, { recursive: true })

            expect(resolveDataDir(mockBase)).toBe(directData)
        })
    })
})
