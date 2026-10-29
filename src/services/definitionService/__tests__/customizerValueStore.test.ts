import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { CustomizerValueStore, fnv1a64 } from '../customizerValueStore'

describe('CustomizerValueStore', () => {
    let tempDir: string
    let store: CustomizerValueStore

    const createIndexFile = (dir: string, attributeName: string, values: string[]): string => {
        const hashes = values
            .map((v) => fnv1a64(v))
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        const array = new BigInt64Array(hashes)
        const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
        const filePath = path.join(dir, `${attributeName}.bin`)
        fs.writeFileSync(filePath, buffer)
        return filePath
    }

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valuestore-test-'))
        store = new CustomizerValueStore()
    })

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    })

    describe('Hit, miss, and case-sensitive matching', () => {
        beforeEach(() => {
            createIndexFile(tempDir, 'sAMAccountName', ['jdoe', 'asmith', 'bwayne', 'ckent'])
            store.load(tempDir)
        })

        it('returns true on hit for exact matching value', () => {
            expect(store.has('sAMAccountName', 'jdoe')).toBe(true)
            expect(store.has('sAMAccountName', 'asmith')).toBe(true)
            expect(store.has('sAMAccountName', 'ckent')).toBe(true)
        })

        it('returns false on miss for value not in index', () => {
            expect(store.has('sAMAccountName', 'pparker')).toBe(false)
            expect(store.has('sAMAccountName', 'unknown')).toBe(false)
            expect(store.has('sAMAccountName', '')).toBe(false)
        })

        it('enforces case-sensitive matching', () => {
            expect(store.has('sAMAccountName', 'jdoe')).toBe(true)
            expect(store.has('sAMAccountName', 'JDOE')).toBe(false)
            expect(store.has('sAMAccountName', 'Jdoe')).toBe(false)
            expect(store.has('sAMAccountName', 'BWayne')).toBe(false)
        })

        it('returns false for unindexed attribute', () => {
            expect(store.has('employeeNumber', 'jdoe')).toBe(false)
        })
    })

    describe('Empty index handling', () => {
        it('returns false on search against empty index file', () => {
            createIndexFile(tempDir, 'emptyAttr', [])
            const summary = store.load(tempDir)

            expect(summary.attributeCounts['emptyAttr']).toBe(0)
            expect(summary.totalCount).toBe(0)
            expect(store.has('emptyAttr', 'anything')).toBe(false)
            expect(store.getValueCount('emptyAttr')).toBe(0)
        })

        it('handles non-existent directory gracefully', () => {
            const nonExistentDir = path.join(tempDir, 'non-existent-sub')
            const summary = store.load(nonExistentDir)

            expect(summary.totalCount).toBe(0)
            expect(summary.fileCount).toBe(0)
            expect(store.isLoaded()).toBe(false)
            expect(store.has('sAMAccountName', 'jdoe')).toBe(false)
        })

        it('handles empty directory with no index files gracefully', () => {
            const summary = store.load(tempDir)

            expect(summary.totalCount).toBe(0)
            expect(summary.fileCount).toBe(0)
            expect(store.isLoaded()).toBe(false)
        })
    })

    describe('Metrics and summaries', () => {
        it('tracks attributes, counts, and load timings', () => {
            createIndexFile(tempDir, 'username', ['user1', 'user2', 'user3'])
            createIndexFile(tempDir, 'badgeId', ['1001', '1002'])

            const summary = store.load(tempDir)

            expect(summary.directory).toBe(tempDir)
            expect(summary.fileCount).toBe(2)
            expect(summary.totalCount).toBe(5)
            expect(summary.attributeCounts).toEqual({
                username: 3,
                badgeId: 2,
            })
            expect(typeof summary.durationMs).toBe('number')
            expect(summary.durationMs).toBeGreaterThanOrEqual(0)

            expect(store.getAttributeNames().sort()).toEqual(['badgeId', 'username'])
            expect(store.getValueCount('username')).toBe(3)
            expect(store.getValueCount('badgeId')).toBe(2)
            expect(store.getTotalValueCount()).toBe(5)
            expect(store.getDirectory()).toBe(tempDir)
            expect(store.getDurationMs()).toBe(summary.durationMs)
            expect(store.isLoaded()).toBe(true)
        })
    })
})
