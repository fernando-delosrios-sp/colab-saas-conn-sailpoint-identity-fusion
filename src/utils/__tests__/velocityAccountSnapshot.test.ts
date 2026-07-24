import {
    velocitySnapshotSchemaId,
    velocitySnapshotSchemaName,
    velocitySnapshotSourceId,
    velocitySnapshotSourceName,
} from '../velocityAccountSnapshot'

describe('velocityAccountSnapshot', () => {
    it('reads nested source and schema only', () => {
        const modern = {
            source: { id: 's1', name: 'HR' },
            schema: { id: 'ni', name: 'Jane' },
        }
        expect(velocitySnapshotSourceName(modern)).toBe('HR')
        expect(velocitySnapshotSourceId(modern)).toBe('s1')
        expect(velocitySnapshotSchemaName(modern)).toBe('Jane')
        expect(velocitySnapshotSchemaId(modern)).toBe('ni')
    })

    it('returns empty string when nested source or schema is missing', () => {
        const legacy = { _source: 'L', _sourceId: 'sid', _name: 'N', _managedKey: 'nid' }
        expect(velocitySnapshotSourceName(legacy)).toBe('')
        expect(velocitySnapshotSourceId(legacy)).toBe('')
        expect(velocitySnapshotSchemaName(legacy)).toBe('')
        expect(velocitySnapshotSchemaId(legacy)).toBe('')
    })
})
