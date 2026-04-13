import {
    buildManagedAccountKey,
    isCompositeManagedAccountKey,
    parseManagedAccountKey,
    resolveManagedAccountKey,
} from '../managedAccountKey'

describe('managedAccountKey helpers', () => {
    it('builds composite key from sourceId and nativeIdentity', () => {
        expect(
            buildManagedAccountKey({
                sourceId: 'source-a',
                nativeIdentity: 'native-1',
            })
        ).toBe('source-a::native-1')
    })

    it('returns undefined when composite fields are missing', () => {
        expect(buildManagedAccountKey({})).toBeUndefined()
    })

    it('resolves legacy raw id to composite using lookup', () => {
        expect(resolveManagedAccountKey('raw-1', (rawId) => (rawId === 'raw-1' ? 'source-a::native-1' : undefined))).toBe(
            'source-a::native-1'
        )
    })

    it('detects and parses composite keys', () => {
        const key = 'source-a::native-1'
        expect(isCompositeManagedAccountKey(key)).toBe(true)
        expect(parseManagedAccountKey(key)).toEqual({ sourceId: 'source-a', nativeIdentity: 'native-1' })
    })
})
