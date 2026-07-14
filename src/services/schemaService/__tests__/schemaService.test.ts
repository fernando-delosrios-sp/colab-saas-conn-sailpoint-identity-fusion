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

            // Setup identity attributes containing lowercase "employeeid"
            mockIdentities.fetchIdentitySchemaAttributes.mockResolvedValue([
                { name: 'employeeid', description: 'employee id', type: 'string', multi: false, entitlement: false }
            ])

            const schema = await schemaService.buildDynamicSchema()

            // The resulting schema should have "EmployeeID" (case-preserved from the first-added)
            const attr = schema.attributes.find((a) => a.name.toLowerCase() === 'employeeid')
            expect(attr?.name).toBe('EmployeeID')
        })

        it('should handle API errors during fetch gracefully', async () => {
            mockIdentities.fetchIdentitySchemaAttributes.mockRejectedValue(new Error('Network Error'))

            const schema = await schemaService.buildDynamicSchema()

            expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch identity attributes'))
            // The schema builds successfully without the identity attributes
            expect(schema.attributes.length).toBeGreaterThan(0) // Has static/fusion attributes
        })
    })
})
