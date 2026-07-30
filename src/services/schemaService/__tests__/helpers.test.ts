import {
    isAccountSchema,
    attributeDefinitionToSchemaAttribute,
    apiSchemaToAccountSchema,
    dedupeSchemaAttributesByName,
} from '../helpers'

describe('schemaService helpers', () => {
    describe('isAccountSchema', () => {
        it('should return true for User nativeObjectType', () => {
            expect(isAccountSchema({ nativeObjectType: 'User' } as any)).toBe(true)
        })

        it('should return true for account nativeObjectType', () => {
            expect(isAccountSchema({ nativeObjectType: 'account' } as any)).toBe(true)
        })

        it('should return true for account name', () => {
            expect(isAccountSchema({ name: 'account' } as any)).toBe(true)
        })

        it('should return false for other types', () => {
            expect(isAccountSchema({ nativeObjectType: 'Group' } as any)).toBe(false)
        })
    })

    describe('attributeDefinitionToSchemaAttribute', () => {
        it('should convert attribute definition', () => {
            const def = {
                name: 'displayName',
                description: 'Display name',
                type: 'STRING',
                isMulti: false,
                isEntitlement: false,
            }
            const result = attributeDefinitionToSchemaAttribute(def as any)
            expect(result).toEqual({
                name: 'displayName',
                description: 'Display name',
                type: 'string',
                multi: false,
                entitlement: false,
            })
        })

        it('should use empty defaults for missing fields', () => {
            const result = attributeDefinitionToSchemaAttribute({} as any)
            expect(result.name).toBe('')
            expect(result.type).toBe('string')
        })

        it('should gracefully handle undefined attribute definitions', () => {
            const result = attributeDefinitionToSchemaAttribute(undefined)
            expect(result).toEqual({
                name: '',
                description: '',
                type: 'string',
                multi: false,
                entitlement: false,
            })
        })

        it('should gracefully fallback when type is malformed', () => {
            const result = attributeDefinitionToSchemaAttribute({ name: 'foo', type: { bad: true } } as any)
            expect(result.type).toBe('string')
        })
    })

    describe('dedupeSchemaAttributesByName', () => {
        it('keeps the first variant on case-insensitive collision', () => {
            const result = dedupeSchemaAttributesByName([
                { name: 'Username', type: 'string', multi: false },
                { name: 'username', type: 'string', multi: false },
            ])

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('Username')
        })

        it('keeps the first variant when multiple casings collide', () => {
            const result = dedupeSchemaAttributesByName([
                { name: 'FirstName', type: 'string', multi: false },
                { name: 'firstname', type: 'string', multi: true },
                { name: 'FIRSTNAME', type: 'string', multi: false },
            ])

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('FirstName')
            expect(result[0].multi).toBe(false)
        })

        it('skips blank attribute names', () => {
            const result = dedupeSchemaAttributesByName([
                { name: '  ', type: 'string', multi: false },
                { name: 'email', type: 'string', multi: false },
            ])

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('email')
        })

        it('logs skipped duplicates at debug level', () => {
            const debug = vi.fn()
            dedupeSchemaAttributesByName(
                [
                    { name: 'LastName', type: 'string', multi: false },
                    { name: 'lastname', type: 'string', multi: false },
                ],
                { debug }
            )

            expect(debug).toHaveBeenCalledWith(
                'Skipping duplicate schema attribute "lastname" (keeping "LastName")'
            )
        })
    })

    describe('apiSchemaToAccountSchema', () => {
        it('should convert API schema to AccountSchema', () => {
            const apiSchema = {
                displayAttribute: 'displayName',
                identityAttribute: 'id',
                attributes: [{ name: 'displayName', type: 'STRING', isMulti: false, isEntitlement: false }],
            }
            const result = apiSchemaToAccountSchema(apiSchema as any)
            expect(result.displayAttribute).toBe('displayName')
            expect(result.identityAttribute).toBe('id')
            expect(result.attributes).toHaveLength(1)
            expect(result.attributes[0].name).toBe('displayName')
        })

        it('should ignore malformed attributes safely', () => {
            const apiSchema = {
                displayAttribute: 'displayName',
                identityAttribute: 'id',
                attributes: [
                    undefined,
                    null,
                    { type: 'STRING' },
                    { name: 'displayName', type: 'STRING', isMulti: false, isEntitlement: false },
                ],
            }
            const result = apiSchemaToAccountSchema(apiSchema as any)
            expect(result.attributes).toHaveLength(1)
            expect(result.attributes[0].name).toBe('displayName')
        })
    })
})

