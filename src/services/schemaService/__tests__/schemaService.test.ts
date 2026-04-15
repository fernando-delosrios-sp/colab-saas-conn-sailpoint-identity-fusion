import { AccountSchema } from '@sailpoint/connector-sdk'
import { SchemaService } from '../schemaService'
import { LogService } from '../../logService'
import { SourceService } from '../../sourceService'
import { FusionConfig } from '../../../model/config'

describe('SchemaService', () => {
    describe('getFusionAttributeSubset', () => {
        let schemaService: SchemaService
        let mockLog: LogService
        let mockSources: jest.Mocked<SourceService>

        beforeEach(() => {
            const config = {
                attributeMerge: 'first',
                sources: [],
            } as unknown as FusionConfig
            mockLog = new LogService({ spConnDebugLoggingEnabled: false })
            mockSources = {} as jest.Mocked<SourceService>
            schemaService = new SchemaService(config, mockLog, mockSources)

            const accountSchema: AccountSchema = {
                displayAttribute: 'name',
                identityAttribute: 'id',
                groupAttribute: 'actions',
                attributes: [
                    { name: 'tags', type: 'string', multi: true, description: 'tags' },
                    { name: 'ids', type: 'int', multi: true, description: 'ids' },
                ],
            }
            return schemaService.setFusionAccountSchema(accountSchema)
        })

        it('coerces comma-separated strings into multi-valued string attributes', () => {
            const out = schemaService.getFusionAttributeSubset({ tags: 'a, b' })
            expect(out.tags).toEqual(['a', 'b'])
        })

        it('coerces newline-separated strings into multi-valued string attributes', () => {
            const out = schemaService.getFusionAttributeSubset({ tags: 'a\nb' })
            expect(out.tags).toEqual(['a', 'b'])
        })

        it('coerces JSON array strings with objects into string elements', () => {
            const raw = '[{"key": "a"}, {"key": "b"}]'
            const out = schemaService.getFusionAttributeSubset({ tags: raw })
            expect(out.tags).toEqual(['{"key":"a"}', '{"key":"b"}'])
        })

        it('coerces JSON array strings with numeric primitives for int multi-valued attributes', () => {
            const out = schemaService.getFusionAttributeSubset({ ids: '[1, 2, 3]' })
            expect(out.ids).toEqual([1, 2, 3])
        })
    })
})
