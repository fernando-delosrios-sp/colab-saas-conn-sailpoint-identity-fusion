import { IdentityService } from '../identityService'
import { LogService } from '../logService'
import { SourceService } from '../sourceService'
import { ClientService } from '../clientService'
import { FusionConfig } from '../../model/config'

jest.mock('../logService')
jest.mock('../sourceService')
jest.mock('../clientService')

describe('IdentityService scope tracking', () => {
    let identityService: IdentityService
    let mockLog: jest.Mocked<LogService>
    let mockSources: jest.Mocked<SourceService>
    let mockClient: jest.Mocked<ClientService>
    let mockConfig: FusionConfig

    beforeEach(() => {
        mockConfig = {
            includeIdentities: true,
            identityScopeQuery: 'name:*',
        } as unknown as FusionConfig

        mockLog = new LogService({ spConnDebugLoggingEnabled: false }) as jest.Mocked<LogService>
        mockSources = new SourceService(mockConfig, mockLog, {} as any) as jest.Mocked<SourceService>
        mockClient = new ClientService({} as any, {} as any) as jest.Mocked<ClientService>
        identityService = new IdentityService(mockConfig, mockLog, mockClient, mockSources)
    })

    describe('hasIdentityInScope', () => {
        it('returns true for identities loaded by fetchIdentities', async () => {
            mockClient.paginateSearchApi = jest.fn().mockResolvedValue([
                { id: 'identity-1', name: 'Identity One', protected: false },
            ])

            await identityService.fetchIdentities()

            expect(identityService.hasIdentityInScope('identity-1')).toBe(true)
            expect(identityService.hasIdentityInScope('identity-2')).toBe(false)
        })

        it('returns false after clear', async () => {
            mockClient.paginateSearchApi = jest.fn().mockResolvedValue([
                { id: 'identity-1', name: 'Identity One', protected: false },
            ])

            await identityService.fetchIdentities()
            identityService.clear()

            expect(identityService.hasIdentityInScope('identity-1')).toBe(false)
        })

        it('does not consider identities fetched individually via fetchIdentityById', async () => {
            mockClient.paginateSearchApi = jest.fn().mockResolvedValue([])

            await identityService.fetchIdentities()
            await identityService.fetchIdentityById('identity-individual')

            expect(identityService.hasIdentityInScope('identity-individual')).toBe(false)
        })
    })

    describe('isIdentityInScope', () => {
        it('returns true when targeted search finds the identity', async () => {
            mockClient.paginateSearchApi = jest.fn().mockResolvedValue([
                { id: 'identity-1', name: 'Identity One', protected: false },
            ])

            const result = await identityService.isIdentityInScope('identity-1')

            expect(result).toBe(true)
            expect(mockClient.paginateSearchApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: expect.objectContaining({
                        query: 'id:"identity-1" AND (name:*)',
                    }),
                }),
                expect.anything(),
                expect.anything()
            )
        })

        it('returns false when targeted search finds no identities', async () => {
            mockClient.paginateSearchApi = jest.fn().mockResolvedValue([])

            const result = await identityService.isIdentityInScope('identity-1')

            expect(result).toBe(false)
        })

        it('returns false when includeIdentities is disabled', async () => {
            identityService = new IdentityService(
                { includeIdentities: false } as unknown as FusionConfig,
                mockLog,
                mockClient,
                mockSources
            )

            const result = await identityService.isIdentityInScope('identity-1')

            expect(result).toBe(false)
            expect(mockClient.paginateSearchApi).not.toHaveBeenCalled()
        })

        it('returns false when no scope query is configured', async () => {
            identityService = new IdentityService(
                { includeIdentities: true } as unknown as FusionConfig,
                mockLog,
                mockClient,
                mockSources
            )

            const result = await identityService.isIdentityInScope('identity-1')

            expect(result).toBe(false)
            expect(mockClient.paginateSearchApi).not.toHaveBeenCalled()
        })
    })

    describe('fetchIdentitySchemaAttributes', () => {
        it('should fetch, filter, and map identity attributes correctly', async () => {
            Object.defineProperty(mockClient, 'identityAttributesApi', {
                get: () => ({
                    listIdentityAttributes: jest.fn().mockResolvedValue({
                        data: [
                            { name: 'empId', displayName: 'Employee ID', type: 'STRING', multi: false },
                            { name: 'groups', displayName: 'Groups', type: 'STRING', multi: true },
                            { name: 'unrecognized', displayName: 'Unrecognized Type', type: 'CUSTOM_TYPE', multi: false },
                            { name: '', displayName: 'Empty Name', type: 'STRING', multi: false },
                        ],
                    }),
                }),
                configurable: true,
            })
            mockClient.execute = jest.fn().mockImplementation((fn) => fn())

            const attrs = await identityService.fetchIdentitySchemaAttributes()

            expect(attrs).toHaveLength(3)

            expect(attrs[0]).toEqual({
                name: 'empId',
                description: 'Employee ID',
                type: 'string',
                multi: false,
                entitlement: false,
            })

            expect(attrs[1]).toEqual({
                name: 'groups',
                description: 'Groups',
                type: 'string',
                multi: true,
                entitlement: false,
            })

            expect(attrs[2]).toEqual({
                name: 'unrecognized',
                description: 'Unrecognized Type',
                type: 'string',
                multi: false,
                entitlement: false,
            })
        })
    })
})
