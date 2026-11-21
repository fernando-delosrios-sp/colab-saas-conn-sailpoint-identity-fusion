import { CompactStringSetMap } from '../compactStringSetMap'

describe('CompactStringSetMap', () => {
    it('stores single-key entries as bare strings without Set allocation', () => {
        const map = new CompactStringSetMap()
        expect(map).toBeInstanceOf(Map)

        map.addKey('id-1', 'src::u1')
        expect(map.size).toBe(1)
        expect(map.has('id-1')).toBe(true)

        // Internal storage is a bare string, not a Set
        const rawStored = Map.prototype.get.call(map, 'id-1')
        expect(typeof rawStored).toBe('string')
        expect(rawStored).toBe('src::u1')

        // Non-promoting getKeys returns a ReadonlySet view without mutating internal storage
        const view = map.getKeys('id-1')
        expect(view?.size).toBe(1)
        expect(view?.has('src::u1')).toBe(true)
        expect(Array.from(view ?? [])).toEqual(['src::u1'])
        expect(typeof Map.prototype.get.call(map, 'id-1')).toBe('string')

        // takeKeys removes and yields without Set promotion
        expect(Array.from(map.takeKeys('id-1') ?? [])).toEqual(['src::u1'])
        expect(map.size).toBe(0)
        expect(map.has('id-1')).toBe(false)
    })

    it('promotes to Set when a second key is added or external get() is called', () => {
        const map = new CompactStringSetMap()
        map.addKey('id-1', 'src::u1')
        map.addKey('id-1', 'src::u1') // duplicate key stays bare string
        expect(typeof Map.prototype.get.call(map, 'id-1')).toBe('string')

        // Second distinct key promotes to Set
        map.addKey('id-1', 'src::u2')
        const raw = Map.prototype.get.call(map, 'id-1')
        expect(raw).toBeInstanceOf(Set)
        expect(Array.from(map.getKeys('id-1') ?? [])).toEqual(['src::u1', 'src::u2'])

        // External .get() promotes single-key entry in place
        map.addKey('id-2', 'src::u3')
        expect(typeof Map.prototype.get.call(map, 'id-2')).toBe('string')
        const externalSet = map.get('id-2')
        expect(externalSet).toBeInstanceOf(Set)
        expect(Array.from(externalSet ?? [])).toEqual(['src::u3'])
        expect(Map.prototype.get.call(map, 'id-2')).toBe(externalSet)

        // Mutating the returned Set works as standard Map<string, Set<string>>
        externalSet?.add('src::u4')
        expect(Array.from(map.getKeys('id-2') ?? [])).toEqual(['src::u3', 'src::u4'])
    })

    it('supports deleteKey, clear, and Map iterators', () => {
        const map = new CompactStringSetMap()
        map.addKey('id-1', 'k1')
        map.addKey('id-1', 'k2')
        map.addKey('id-2', 'k3')

        expect(map.deleteKey('missing', 'k1')).toBe(false)
        expect(map.deleteKey('id-2', 'wrong')).toBe(false)
        expect(map.deleteKey('id-1', 'k1')).toBe(true)
        // Demoted back to bare string when 1 key remains
        expect(typeof Map.prototype.get.call(map, 'id-1')).toBe('string')

        expect(Array.from(map.keys())).toEqual(['id-1', 'id-2'])
        expect(Array.from(map.values()).map((s) => Array.from(s))).toEqual([['k2'], ['k3']])
        expect(Array.from(map.entries()).map(([k, s]) => [k, Array.from(s)])).toEqual([
            ['id-1', ['k2']],
            ['id-2', ['k3']],
        ])

        const visited: string[] = []
        map.forEach((set, id) => {
            visited.push(`${id}:${Array.from(set).join(',')}`)
        })
        expect(visited).toEqual(['id-1:k2', 'id-2:k3'])

        expect(map.deleteKey('id-1', 'k2')).toBe(true)
        expect(map.has('id-1')).toBe(false)
        map.clear()
        expect(map.size).toBe(0)
    })
})
