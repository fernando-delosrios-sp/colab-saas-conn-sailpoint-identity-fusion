import { SchemaService } from '../schemaService'

describe('SchemaService', () => {
    let schemaService: SchemaService

    let mockClient: any
    let mockSources: any

    beforeEach(() => {
        mockClient = {
            identityAttributesApi: {
                listIdentityAttributes: jest.fn().mockResolvedValue({ data: [] }),
            },
            execute: jest.fn().mockImplementation((fn) => fn()),
        }
        mockSources = {
            managedSources: [],
        }
        // Minimal mock setup
        schemaService = new SchemaService(
            {
                attributeMerge: 'list',
                sources: [],
            } as any,
            { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
            mockSources as any,
            mockClient as any
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
            expect(result).toBe('Alice,Bob')
        })

        it('should return null for null/undefined value regardless of cardinality', () => {
            const multiDef = { name: 'roles', type: 'string', multi: true }
            const singleDef = { name: 'name', type: 'string', multi: false }
            expect((schemaService as any).castAttributeValue(null, multiDef)).toBeNull()
            expect((schemaService as any).castAttributeValue(undefined, singleDef)).toBeNull()
        })
    })

    describe('buildDynamicSchema', () => {
        it('should fetch and include identity schema attributes when includeIdentities is true/default', async () => {
            mockClient.identityAttributesApi.listIdentityAttributes.mockResolvedValue({
                data: [
                    { name: 'empId', displayName: 'Employee ID', type: 'STRING', multi: false },
                    { name: 'groups', displayName: 'Groups', type: 'STRING', multi: true },
                ],
            })

            const schema = await schemaService.buildDynamicSchema()
            
            // Check that the returned attributes contain the converted identity attributes
            const empIdAttr = schema.attributes.find((a) => a.name === 'empId')
            expect(empIdAttr).toEqual({
                name: 'empId',
                description: 'Employee ID',
                type: 'string',
                multi: false,
                entitlement: false,
            })

            const groupsAttr = schema.attributes.find((a) => a.name === 'groups')
            expect(groupsAttr).toEqual({
                name: 'groups',
                description: 'Groups',
                type: 'string',
                multi: true,
                entitlement: false,
            })
        })

        it('should not include identity schema attributes when includeIdentities is false', async () => {
            // Re-instantiate with includeIdentities: false
            schemaService = new SchemaService(
                {
                    attributeMerge: 'list',
                    sources: [],
                    includeIdentities: false,
                } as any,
                { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
                mockSources as any,
                mockClient as any
            )

            mockClient.identityAttributesApi.listIdentityAttributes.mockResolvedValue({
                data: [
                    { name: 'empId', displayName: 'Employee ID', type: 'STRING', multi: false },
                ],
            })

            const schema = await schemaService.buildDynamicSchema()
            const empIdAttr = schema.attributes.find((a) => a.name === 'empId')
            expect(empIdAttr).toBeUndefined()
            expect(mockClient.identityAttributesApi.listIdentityAttributes).not.toHaveBeenCalled()
        })
    })
})
