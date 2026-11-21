import type { AccountV2025 as Account } from 'sailpoint-api-client'
import { CompactManagedAccountMap } from '../compactManagedAccountMap'

function makeAccount(index: number): Account {
    return {
        id: `id-${index}`,
        name: `user-${index}`,
        sourceId: 'src-1',
        sourceName: 'AD',
        nativeIdentity: `native-${index}`,
        attributes: { mail: `user-${index}@example.com`, department: 'Eng' },
        disabled: false,
        uncorrelated: true,
    } as Account
}

describe('CompactManagedAccountMap', () => {
    it('behaves as a standard Map across in-heap and Buffer-slab entries', () => {
        const map = new CompactManagedAccountMap({ inHeapLimit: 2, slabBytes: 256 })
        expect(map).toBeInstanceOf(Map)

        const a0 = makeAccount(0)
        const a1 = makeAccount(1)
        const a2 = makeAccount(2)
        const a3 = makeAccount(3)

        map.set('k0', a0)
        map.set('k1', a1)
        map.set('k2', a2)
        map.set('k3', a3)

        expect(map.size).toBe(4)
        expect(map.has('k0')).toBe(true)
        expect(map.has('k3')).toBe(true)
        expect(map.get('k0')).toBe(a0) // in-heap preserves identity
        expect(map.get('k2')).toEqual(a2)
        expect(map.get('k3')).toEqual(a3)
        expect(Array.from(map.keys())).toEqual(['k0', 'k1', 'k2', 'k3'])
        expect(Array.from(map.values())).toEqual([a0, a1, a2, a3])
        expect(Array.from(map.entries())).toEqual([
            ['k0', a0],
            ['k1', a1],
            ['k2', a2],
            ['k3', a3],
        ])

        const visited: string[] = []
        map.forEach((value, key) => {
            visited.push(`${key}:${value.id}`)
        })
        expect(visited).toEqual(['k0:id-0', 'k1:id-1', 'k2:id-2', 'k3:id-3'])

        // Overwrite a slab entry
        const updated2 = makeAccount(200)
        map.set('k2', updated2)
        expect(map.get('k2')).toEqual(updated2)
        expect(map.size).toBe(4)

        // Delete slab and heap entries
        expect(map.delete('k2')).toBe(true)
        expect(map.has('k2')).toBe(false)
        expect(map.get('k2')).toBeUndefined()
        expect(map.size).toBe(3)

        map.clear()
        expect(map.size).toBe(0)
        expect(Array.from(map.values())).toEqual([])
    })
})
