import {
    velocitySnapshotSchemaId,
    velocitySnapshotSchemaName,
    velocitySnapshotSourceId,
    velocitySnapshotSourceName,
} from '../velocityAccountSnapshot'

describe('velocityAccountSnapshot', () => {
    const account = {
        source: { name: 'Source A', id: 'src-a' },
        schema: { name: 'Schema A', id: 'schema-a' },
    }

    it('reads source name', () => {
        expect(velocitySnapshotSourceName(account)).toBe('Source A')
    })

    it('reads source id', () => {
        expect(velocitySnapshotSourceId(account)).toBe('src-a')
    })

    it('reads schema name', () => {
        expect(velocitySnapshotSchemaName(account)).toBe('Schema A')
    })

    it('reads schema id', () => {
        expect(velocitySnapshotSchemaId(account)).toBe('schema-a')
    })

    it('returns empty string for missing nested object', () => {
        expect(velocitySnapshotSourceName({})).toBe('')
        expect(velocitySnapshotSchemaId(null)).toBe('')
    })

    it('trims string values', () => {
        expect(velocitySnapshotSourceName({ source: { name: '  spaced  ' } })).toBe('spaced')
    })

    it('reads nested source and schema and ignores flat-key fallbacks', () => {
        const modern = {
            source: { id: 's1', name: 'HR' },
            schema: { id: 'ni', name: 'Jane' },
        }
        expect(velocitySnapshotSourceName(modern)).toBe('HR')
        expect(velocitySnapshotSourceId(modern)).toBe('s1')
        expect(velocitySnapshotSchemaName(modern)).toBe('Jane')
        expect(velocitySnapshotSchemaId(modern)).toBe('ni')

        const legacy = { _source: 'L', _sourceId: 'sid', _name: 'N', _managedKey: 'nid' }
        expect(velocitySnapshotSourceName(legacy)).toBe('')
        expect(velocitySnapshotSourceId(legacy)).toBe('')
        expect(velocitySnapshotSchemaName(legacy)).toBe('')
        expect(velocitySnapshotSchemaId(legacy)).toBe('')
    })
})
