import type { AccountV2025 as Account } from 'sailpoint-api-client'
import { CompressedBlockMap } from '../compressedBlockMap'

function makeAccount(index: number, sourceId = 'src-ad-1'): Account {
    return {
        id: `id-${index}`,
        name: `user-${index}`,
        sourceId,
        sourceName: 'AD',
        nativeIdentity: `user-${index}`,
        attributes: { mail: `user-${index}@example.com`, department: 'Eng' },
        disabled: false,
        uncorrelated: true,
    } as Account
}

describe('CompressedBlockMap', () => {
    it('Small run preserves direct object identity', () => {
        const map = new CompressedBlockMap<Account>({ inHeapLimit: 10_000 })
        expect(map).toBeInstanceOf(Map)

        const a0 = makeAccount(0)
        const a1 = makeAccount(1)
        map.set('src-ad-1::user-0', a0)
        map.set('src-ad-1::user-1', a1)

        expect(map.size).toBe(2)
        expect(map.sealedBlockCount).toBe(0)
        expect(map.get('src-ad-1::user-0')).toBe(a0)
        expect(map.get('src-ad-1::user-1')).toBe(a1)
    })

    it('Large run compresses spilled blocks in memory with full Map parity', () => {
        const map = new CompressedBlockMap<Account>({
            inHeapLimit: 2,
            blockSize: 4,
            lruCapacity: 2,
        })
        expect(map).toBeInstanceOf(Map)

        const accounts = Array.from({ length: 12 }, (_, idx) => makeAccount(idx))
        for (let i = 0; i < 12; i++) {
            map.set(`k-${i}`, accounts[i])
        }

        expect(map.size).toBe(12)
        // 2 in-heap + 10 spilled => 2 sealed blocks of 4 + 2 pending
        expect(map.sealedBlockCount).toBe(2)

        for (let i = 0; i < 12; i++) {
            expect(map.has(`k-${i}`)).toBe(true)
            expect(map.get(`k-${i}`)).toEqual(accounts[i])
        }
        expect(map.get('missing')).toBeUndefined()
        expect(map.has('missing')).toBe(false)

        // Bounded LRU cache never exceeds lruCapacity
        expect(map.cacheSize).toBeLessThanOrEqual(2)

        // Exact Map iterator parity
        expect(Array.from(map.keys())).toEqual(accounts.map((_, i) => `k-${i}`))
        expect(Array.from(map.values())).toEqual(accounts)
        expect(Array.from(map.entries())).toEqual(accounts.map((a, i) => [`k-${i}`, a]))
        expect(Array.from(map)).toEqual(accounts.map((a, i) => [`k-${i}`, a]))

        const visited: string[] = []
        map.forEach((value, key) => {
            visited.push(`${key}:${value.id}`)
        })
        expect(visited).toEqual(accounts.map((a, i) => `k-${i}:${a.id}`))

        // Overwrite a compressed entry
        const updated = makeAccount(999)
        map.set('k-5', updated)
        expect(map.get('k-5')).toEqual(updated)
        expect(map.size).toBe(12)

        // Delete compressed and in-heap entries
        expect(map.delete('k-5')).toBe(true)
        expect(map.delete('k-5')).toBe(false)
        expect(map.has('k-5')).toBe(false)
        expect(map.get('k-5')).toBeUndefined()
        expect(map.delete('k-0')).toBe(true)
        expect(map.size).toBe(10)
    })

    it('Draining all keys in one sealed block releases that block immediately', () => {
        const map = new CompressedBlockMap<Account>({
            inHeapLimit: 0,
            blockSize: 2,
            lruCapacity: 4,
        })

        for (let i = 0; i < 6; i++) {
            map.set(`k-${i}`, makeAccount(i))
        }
        // 3 sealed blocks: [k-0, k-1], [k-2, k-3], [k-4, k-5]
        expect(map.sealedBlockCount).toBe(3)
        expect(map.get('k-0')?.id).toBe('id-0')
        expect(map.get('k-2')?.id).toBe('id-2')
        expect(map.cacheSize).toBe(2)

        const sealedBlocks = (map as any).sealedBlocks as Buffer[]
        expect(sealedBlocks[0].byteLength).toBeGreaterThan(0)
        expect(sealedBlocks[1].byteLength).toBeGreaterThan(0)

        // Delete every key in block 0 while later blocks still hold live keys
        expect(map.delete('k-0')).toBe(true)
        expect(sealedBlocks[0].byteLength).toBeGreaterThan(0)
        expect(map.delete('k-1')).toBe(true)

        expect(sealedBlocks[0].byteLength).toBe(0)
        expect(map.cacheSize).toBe(1)
        expect(sealedBlocks[1].byteLength).toBeGreaterThan(0)
        expect(map.get('k-2')?.id).toBe('id-2')
        expect(map.get('k-4')?.id).toBe('id-4')
        expect(Array.from(map.keys())).toEqual(['k-2', 'k-3', 'k-4', 'k-5'])

        // Overwriting every key in block 1 also releases block 1 immediately
        map.set('k-2', makeAccount(200))
        map.set('k-3', makeAccount(300))
        expect(sealedBlocks[1].byteLength).toBe(0)
        expect(map.get('k-2')?.id).toBe('id-200')
        expect(map.get('k-3')?.id).toBe('id-300')
        expect(map.get('k-5')?.id).toBe('id-5')
    })

    it('Releases sealed blocks, pending buffers, and LRU cache on delete-to-empty and clear', () => {
        const map = new CompressedBlockMap<Account>({
            inHeapLimit: 1,
            blockSize: 2,
            lruCapacity: 4,
        })

        for (let i = 0; i < 6; i++) {
            map.set(`k-${i}`, makeAccount(i))
        }
        expect(map.sealedBlockCount).toBe(2)
        expect(map.get('k-2')).toBeDefined()
        expect(map.cacheSize).toBe(1)

        // Delete all compressed keys (k-1..k-5) while keeping in-heap k-0
        for (let i = 1; i < 6; i++) {
            expect(map.delete(`k-${i}`)).toBe(true)
        }
        expect(map.size).toBe(1)
        expect(map.sealedBlockCount).toBe(0)
        expect(map.cacheSize).toBe(0)

        // Re-fill and verify clear() releases everything
        for (let i = 1; i < 6; i++) {
            map.set(`k-${i}`, makeAccount(i))
        }
        expect(map.sealedBlockCount).toBe(2)
        expect(map.get('k-2')).toBeDefined()
        expect(map.cacheSize).toBe(1)

        map.clear()
        expect(map.size).toBe(0)
        expect(map.sealedBlockCount).toBe(0)
        expect(map.cacheSize).toBe(0)
        expect(Array.from(map.entries())).toEqual([])
    })

    it('Composite keys round-trip without duplicating sourceId prefixes', () => {
        const map = new CompressedBlockMap<Account>({
            inHeapLimit: 0,
            blockSize: 8,
            partitionCompositeKeys: true,
        })

        for (let i = 1; i <= 20; i++) {
            map.set(`src-ad-1::user-${i}`, makeAccount(i, 'src-ad-1'))
        }

        expect(map.size).toBe(20)
        expect(map.internalPartitions.size).toBe(1)
        const srcPartition = map.internalPartitions.get('src-ad-1')
        expect(srcPartition?.size).toBe(20)
        expect(srcPartition?.has('user-1')).toBe(true)
        expect(srcPartition?.has('user-20')).toBe(true)

        const expectedKeys = Array.from({ length: 20 }, (_, i) => `src-ad-1::user-${i + 1}`)
        expect(Array.from(map.keys())).toEqual(expectedKeys)
        expect(Array.from(map.entries()).map(([k]) => k)).toEqual(expectedKeys)

        expect(map.has('src-ad-1::user-12')).toBe(true)
        expect(map.get('src-ad-1::user-12')?.nativeIdentity).toBe('user-12')

        expect(map.delete('src-ad-1::user-12')).toBe(true)
        expect(map.has('src-ad-1::user-12')).toBe(false)
        expect(map.size).toBe(19)
    })

    it('Non-composite keys remain supported in the fallback partition', () => {
        const map = new CompressedBlockMap<Account>({
            inHeapLimit: 0,
            blockSize: 4,
            partitionCompositeKeys: true,
        })

        const plain = makeAccount(1, 'plain')
        map.set('plain-id', plain)

        expect(map.internalPartitions.has('')).toBe(true)
        expect(map.has('plain-id')).toBe(true)
        expect(map.get('plain-id')).toEqual(plain)
        expect(Array.from(map.keys())).toEqual(['plain-id'])

        expect(map.delete('plain-id')).toBe(true)
        expect(map.has('plain-id')).toBe(false)
        expect(map.internalPartitions.size).toBe(0)
        expect(map.size).toBe(0)
    })
})
