import { SchemaService } from '../schemaService'

describe('SchemaService', () => {
    let schemaService: SchemaService

    beforeEach(() => {
        // Minimal mock setup
        schemaService = new SchemaService(
            {
                attributeMerge: 'list',
                sources: [],
            } as any,
            { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
            {} as any
        )
    })

    describe('castAttributeValue (private)', () => {
        it('should filter null and undefined from multi-valued string arrays', () => {
            const schemaDef = { name: 'roles', type: 'string', multi: true }
            const result = (schemaService as any).castAttributeValue(
                ['Admin', null, 'User', undefined],
                schemaDef
            )
            expect(result).toEqual(['Admin', 'User'])
        })

        it('should filter null and undefined from multi-valued number arrays', () => {
            const schemaDef = { name: 'scores', type: 'int', multi: true }
            const result = (schemaService as any).castAttributeValue(
                [1, null, 2, undefined, 3],
                schemaDef
            )
            expect(result).toEqual([1, 2, 3])
        })

        it('should keep valid multi-valued string array unchanged', () => {
            const schemaDef = { name: 'roles', type: 'string', multi: true }
            const result = (schemaService as any).castAttributeValue(
                ['Admin', 'User'],
                schemaDef
            )
            expect(result).toEqual(['Admin', 'User'])
        })

        it('should wrap scalar value in array for multi-valued attribute', () => {
            const schemaDef = { name: 'roles', type: 'string', multi: true }
            const result = (schemaService as any).castAttributeValue('Admin', schemaDef)
            expect(result).toEqual(['Admin'])
        })

        it('should join array into CSV string for single-valued attribute', () => {
            const schemaDef = { name: 'displayName', type: 'string', multi: false }
            const result = (schemaService as any).castAttributeValue(
                ['Alice', 'Bob'],
                schemaDef
            )
            expect(result).toBe('Alice, Bob')
        })

        it('should return null for null/undefined value regardless of cardinality', () => {
            const multiDef = { name: 'roles', type: 'string', multi: true }
            const singleDef = { name: 'name', type: 'string', multi: false }
            expect((schemaService as any).castAttributeValue(null, multiDef)).toBeNull()
            expect((schemaService as any).castAttributeValue(undefined, singleDef)).toBeNull()
        })
    })
})
