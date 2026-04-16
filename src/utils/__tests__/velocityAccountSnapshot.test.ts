import {
    velocitySnapshotSchemaId,
    velocitySnapshotSchemaName,
    velocitySnapshotSourceId,
    velocitySnapshotSourceName,
} from '../velocityAccountSnapshot'

describe('velocityAccountSnapshot', () => {
    it('reads nested source and schema with flat-key fallbacks', () => {
        const modern = {
            source: { id: 's1', name: 'HR' },
            schema: { id: 'ni', name: 'Jane' },
        }
        expect(velocitySnapshotSourceName(modern)).toBe('HR')
        expect(velocitySnapshotSourceId(modern)).toBe('s1')
        expect(velocitySnapshotSchemaName(modern)).toBe('Jane')
        expect(velocitySnapshotSchemaId(modern)).toBe('ni')

        const legacy = { _source: 'L', _sourceId: 'sid', _name: 'N', _managedKey: 'nid' }
        expect(velocitySnapshotSourceName(legacy)).toBe('L')
        expect(velocitySnapshotSourceId(legacy)).toBe('sid')
        expect(velocitySnapshotSchemaName(legacy)).toBe('N')
        expect(velocitySnapshotSchemaId(legacy)).toBe('nid')

    })
})
