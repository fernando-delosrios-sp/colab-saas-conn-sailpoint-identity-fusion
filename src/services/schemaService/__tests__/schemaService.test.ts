import { SchemaService } from '../schemaService'

describe('SchemaService', () => {
    let schemaService: SchemaService
    let mockConfig: any
    let mockLog: any
    let mockSources: any
    let mockIdentities: any

    beforeEach(() => {
        mockConfig = {
            attributeMerge: 'list',
            sources: [],
            includeIdentities: true,
        }
        mockLog = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }
        mockSources = {
            managedSources: [],
        }
        mockIdentities = {
            fetchIdentitySchemaAttributes: vi.fn().mockResolvedValue([
                { name: 'empId', description: 'Employee ID', type: 'string', multi: false, entitlement: false },
                { name: 'groups', description: 'Groups', type: 'string', multi: true, entitlement: false },
                { name: 'unrecognized', description: 'Unrecognized Type', type: 'string', multi: false, entitlement: false },
            ]),
        }

        schemaService = new SchemaService(mockConfig, mockLog, mockSources, mockIdentities)
    })

    describe('buildDynamicSchema', () => {
        it('should call identities.fetchIdentitySchemaAttributes and include mapped identity attributes correctly', async () => {
            const schema = await schemaService.buildDynamicSchema()

            expect(mockIdentities.fetchIdentitySchemaAttributes).toHaveBeenCalled()

            const empIdAttr = schema.attributes.find((a) => a.name === 'empId')
            expect(empIdAttr).toEqual({
                name: 'empId',
                description: 'Employee ID',
                type: 'string',
                multi: false,
                entitlement: false,
            })

            const unrecognizedAttr = schema.attributes.find((a) => a.name === 'unrecognized')
            expect(unrecognizedAttr).toBeDefined()
            expect(unrecognizedAttr?.type).toBe('string')
        })

        it('should preserve original casing on collisions', async () => {
            // Setup an account schema attribute with "EmployeeID"
            mockSources.managedSources = [{ id: 'src-1', name: 'Source 1' }]
            vi.spyOn(schemaService as any, 'fetchAccountSchema').mockResolvedValue({
                displayAttribute: 'name',
                identityAttribute: 'id',
                attributes: [{ name: 'EmployeeID', type: 'string', multi: false }],
            })

            // Setup identity attributes containing lowercase "employeeid" with different metadata
            mockIdentities.fetchIdentitySchemaAttributes.mockResolvedValue([
                {
                    name: 'employeeid',
                    description: 'employee id',
                    type: 'string',
                    multi: true,
                    entitlement: false,
                },
            ])

            const schema = await schemaService.buildDynamicSchema()

            const attr = schema.attributes.find((a) => a.name.toLowerCase() === 'employeeid')
            expect(attr?.name).toBe('EmployeeID')
            expect(attr?.description).toBe('EmployeeID from Source 1')
        })

        it('should dedupe Username and username from managed source', async () => {
            mockSources.managedSources = [{ id: 'src-1', name: 'Source 1' }]
            vi.spyOn(schemaService as any, 'fetchAccountSchema').mockResolvedValue({
                displayAttribute: 'name',
                identityAttribute: 'id',
                attributes: [
                    { name: 'Username', type: 'string', multi: false },
                    { name: 'username', type: 'string', multi: false },
                ],
            })

            const schema = await schemaService.buildDynamicSchema()
            const usernameAttrs = schema.attributes.filter((a) => a.name.toLowerCase() === 'username')

            expect(usernameAttrs).toHaveLength(1)
            expect(usernameAttrs[0].name).toBe('Username')
        })

        it('should dedupe FirstName from identity when firstname exists on managed source', async () => {
            mockSources.managedSources = [{ id: 'src-1', name: 'Source 1' }]
            vi.spyOn(schemaService as any, 'fetchAccountSchema').mockResolvedValue({
                displayAttribute: 'name',
                identityAttribute: 'id',
                attributes: [{ name: 'firstname', type: 'string', multi: false }],
            })
            mockIdentities.fetchIdentitySchemaAttributes.mockResolvedValue([
                { name: 'FirstName', type: 'string', multi: false, entitlement: false },
            ])

            const schema = await schemaService.buildDynamicSchema()
            const firstnameAttrs = schema.attributes.filter((a) => a.name.toLowerCase() === 'firstname')

            expect(firstnameAttrs).toHaveLength(1)
            expect(firstnameAttrs[0].name).toBe('firstname')
        })

        it('should dedupe LastName from identity when lastname exists on managed source', async () => {
            mockSources.managedSources = [{ id: 'src-1', name: 'Source 1' }]
            vi.spyOn(schemaService as any, 'fetchAccountSchema').mockResolvedValue({
                displayAttribute: 'name',
                identityAttribute: 'id',
                attributes: [{ name: 'lastname', type: 'string', multi: false }],
            })
            mockIdentities.fetchIdentitySchemaAttributes.mockResolvedValue([
                { name: 'LastName', type: 'string', multi: false, entitlement: false },
            ])

            const schema = await schemaService.buildDynamicSchema()
            const lastnameAttrs = schema.attributes.filter((a) => a.name.toLowerCase() === 'lastname')

            expect(lastnameAttrs).toHaveLength(1)
            expect(lastnameAttrs[0].name).toBe('lastname')
        })

        it('should handle API errors during fetch gracefully', async () => {
            mockIdentities.fetchIdentitySchemaAttributes.mockRejectedValue(new Error('Network Error'))

            const schema = await schemaService.buildDynamicSchema()

            expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch identity attributes'))
            // The schema builds successfully without the identity attributes
            expect(schema.attributes.length).toBeGreaterThan(0) // Has static/fusion attributes
        })
    })

    describe('getFusionAttributeSubset', () => {
        beforeEach(async () => {
            await schemaService.setFusionAccountSchema({
                displayAttribute: 'name',
                identityAttribute: 'id',
                attributes: [
                    { name: 'id', type: 'string', required: true },
                    { name: 'name', type: 'string', required: true },
                    { name: 'department', type: 'string', multi: false },
                    { name: 'reviews', type: 'string', multi: true },
                ],
            })
        })

        it('omits null or absent schema attributes from platform output', () => {
            const resultWithNull = schemaService.getFusionAttributeSubset({
                id: '1',
                name: 'Ada Wong',
                department: null,
            })

            expect(resultWithNull).toMatchObject({ id: '1', name: 'Ada Wong' })
            expect(resultWithNull).not.toHaveProperty('department')

            const resultWithAbsent = schemaService.getFusionAttributeSubset({
                id: '1',
                name: 'Ada Wong',
            })

            expect(resultWithAbsent).not.toHaveProperty('department')
        })

        it('retains populated attribute values', () => {
            const result = schemaService.getFusionAttributeSubset({
                id: '1',
                name: 'Ada Wong',
            })

            expect(result.name).toBe('Ada Wong')
        })

        it('retains empty multi-valued arrays', () => {
            const result = schemaService.getFusionAttributeSubset({
                id: '1',
                name: 'Ada Wong',
                reviews: [],
            })

            expect(result.reviews).toEqual([])
        })

        it('does not mutate the input attribute bag', () => {
            const input = {
                id: '1',
                name: 'Ada Wong',
                department: null,
            }

            schemaService.getFusionAttributeSubset(input)

            expect(input).toEqual({
                id: '1',
                name: 'Ada Wong',
                department: null,
            })
        })
    })

    describe('setFusionAccountSchema', () => {
        it('dedupes case-insensitive duplicate attribute names from input schema', async () => {
            await schemaService.setFusionAccountSchema({
                displayAttribute: 'name',
                identityAttribute: 'id',
                attributes: [
                    { name: 'LastName', type: 'string', multi: false },
                    { name: 'lastname', type: 'string', multi: false },
                ],
            })

            const names = schemaService.listSchemaAttributeNames()
            const lastnameNames = names.filter((n) => n.toLowerCase() === 'lastname')
            expect(lastnameNames).toHaveLength(1)
            expect(lastnameNames[0]).toBe('LastName')
        })

        it('emits a single key from getFusionAttributeSubset when bag has duplicate casings', async () => {
            await schemaService.setFusionAccountSchema({
                displayAttribute: 'name',
                identityAttribute: 'id',
                attributes: [
                    { name: 'LastName', type: 'string', multi: false },
                    { name: 'lastname', type: 'string', multi: false },
                ],
            })

            const result = schemaService.getFusionAttributeSubset({
                id: '1',
                name: 'Ada Wong',
                LastName: 'Wong',
                lastname: 'Ignored',
            })

            expect(Object.keys(result).filter((k) => k.toLowerCase() === 'lastname')).toHaveLength(1)
            expect(result.LastName).toBe('Wong')
            expect(result).not.toHaveProperty('lastname')
        })
    })
})


