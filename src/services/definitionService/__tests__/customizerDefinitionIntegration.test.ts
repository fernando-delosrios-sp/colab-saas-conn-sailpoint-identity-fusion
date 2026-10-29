import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DefinitionService } from '../definitionService'
import { InMemoryLockService } from '../../lockService'
import { fnv1a64 } from '../customizerValueStore'
import { setupPhase } from '../../../operations/helpers/accountListPhases'
import { FusionAccount } from '../../../model/account'
import { FusionAccountKind } from '../../../model/fusionAccountTypes'

describe('DefinitionService Customizer Integration', () => {
    let tempDir: string
    let mockLog: any
    let mockLocks: any
    let mockSchemas: any

    const createIndexFile = (dir: string, attributeName: string, values: string[]): string => {
        const hashes = values
            .map((v) => fnv1a64(v))
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        const array = new BigInt64Array(hashes)
        const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
        const filePath = path.join(dir, `${attributeName}.bin`)
        fs.writeFileSync(filePath, buffer)
        return filePath
    }

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def-customizer-test-'))
        mockLog = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            detail: vi.fn(),
            track: vi.fn(() => ({ done: vi.fn() })),
            timer: vi.fn(() => ({ end: vi.fn() })),
            getLogLevel: vi.fn(() => 'debug'),
        }
        mockLocks = new InMemoryLockService(mockLog)
        mockSchemas = {
            fusionIdentityAttribute: 'id',
            fusionDisplayAttribute: 'name',
            listSchemaAttributeNames: vi.fn(() => ['sAMAccountName', 'id', 'name']),
            getManagedSourceSchemaAttributeNames: vi.fn().mockResolvedValue(['sAMAccountName']),
            setFusionAccountSchema: vi.fn().mockResolvedValue(undefined),
            loadFusionAccountSchemaFromSource: vi.fn().mockResolvedValue(undefined),
        }
    })

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    })

    describe('Scenario: Logging customizer index loading details', () => {
        it('logs directory path, attribute names, counts, and tracks load timing when initialized', () => {
            createIndexFile(tempDir, 'sAMAccountName', ['admin', 'root', 'guest'])
            createIndexFile(tempDir, 'employeeNumber', ['E001', 'E002'])

            const config: any = {
                uniqueAttributeDefinitions: [
                    { name: 'sAMAccountName', expression: '$fn.$ln' },
                ],
            }
            const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)

            const result = service.initializeCustomizerStore(tempDir)
            expect(result).toBeDefined()
            expect(result?.directory).toBe(tempDir)
            expect(result?.fileCount).toBe(2)
            expect(result?.totalCount).toBe(5)
            expect(result?.attributeCounts).toEqual({
                sAMAccountName: 3,
                employeeNumber: 2,
            })

            expect(mockLog.info).toHaveBeenCalledWith(
                expect.stringContaining(`Loaded customizer unique index store from ${tempDir}: 2 attribute(s), 5 total value(s)`)
            )
            expect(mockLog.detail).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'customizer unique store loaded',
                    directory: tempDir,
                    attributes: {
                        sAMAccountName: 3,
                        employeeNumber: 2,
                    },
                    totalValues: 5,
                })
            )
            expect(mockLog.timer).toHaveBeenCalled()
        })
    })

    describe('Scenario: Logging when customizer directory is absent', () => {
        it('proceeds without error and logs at debug level that no customizer store was attached', () => {
            const config: any = {
                uniqueAttributeDefinitions: [
                    { name: 'sAMAccountName', expression: '$fn.$ln' },
                ],
            }
            const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)

            const result = service.initializeCustomizerStore(undefined)
            expect(result).toBeUndefined()
            expect(mockLog.debug).toHaveBeenCalledWith('No customizer unique value store was attached')
            expect(mockLog.info).not.toHaveBeenCalled()
        })
    })

    describe('Scenario: Candidate value rejected when matching customizer-provided unique value', () => {
        it('reports candidate value as not unique when present in CustomizerValueStore', () => {
            createIndexFile(tempDir, 'sAMAccountName', ['jdoe', 'reserved_user'])

            const config: any = {
                uniqueAttributeDefinitions: [
                    { name: 'sAMAccountName', expression: '$fn.$ln' },
                ],
            }
            const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
            service.initializeCustomizerStore(tempDir)

            // GIVEN a CustomizerValueStore loaded with a reserved value for attribute "sAMAccountName"
            // WHEN DefinitionService evaluates whether candidate value "jdoe" is unique for "sAMAccountName"
            // THEN it SHALL check CustomizerValueStore for "jdoe" and report not unique
            expect(service.isCandidateValueUnique('sAMAccountName', 'jdoe')).toBe(false)
            expect(service.isCandidateValueUnique('sAMAccountName', 'reserved_user')).toBe(false)

            // Non-reserved candidates are unique
            expect(service.isCandidateValueUnique('sAMAccountName', 'available_user')).toBe(true)
        })

        it('disambiguates and generates alternative value when template candidate collides with customizer store', async () => {
            createIndexFile(tempDir, 'sAMAccountName', ['jdoe']) // 'jdoe' is reserved

            const config: any = {
                uniqueAttributeDefinitions: [
                    {
                        name: 'sAMAccountName',
                        expression: '${fn}${ln}${counter}',
                        digits: 1,
                    },
                ],
            }
            const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
            service.initializeCustomizerStore(tempDir)

            const account = new FusionAccount('acc-1', 'source-1', 'Fusion', FusionAccountKind.Fusion)
            account.attributes.name = 'John Doe'
            const context = { fn: 'j', ln: 'doe' }

            const generated = await (service as any).generateUniqueAttributeValue(
                config.uniqueAttributeDefinitions[0],
                account,
                context
            )

            // 'jdoe' should have collided with customizer store, causing disambiguation to 'jdoe1'
            expect(generated).toBe('jdoe1')
            expect(service.isCandidateValueUnique('sAMAccountName', 'jdoe')).toBe(false)
            expect(service.isCandidateValueUnique('sAMAccountName', 'jdoe1')).toBe(false) // now registered
        })
    })

    describe('Wiring through setupPhase', () => {
        it('initializes customizer store when customizerIndicesDir is provided in phase options', async () => {
            createIndexFile(tempDir, 'sAMAccountName', ['customizer_id'])

            const config: any = {
                uniqueAttributeDefinitions: [{ name: 'sAMAccountName', expression: '$fn' }],
                sources: [],
            }
            const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)

            const mockServiceRegistry: any = {
                log: mockLog,
                config,
                fusion: {
                    setTracker: vi.fn(),
                    isResetAccounts: vi.fn(() => false),
                    isResetForms: vi.fn(() => false),
                },
                schemas: mockSchemas,
                sources: {
                    hasFusionSource: true,
                    managedSources: [],
                    fetchAllSources: vi.fn().mockResolvedValue(undefined),
                    setProcessLock: vi.fn().mockResolvedValue(undefined),
                    clearReverseCorrelationReadinessCache: vi.fn(),
                    setupReverseCorrelationSources: vi.fn().mockResolvedValue(0),
                    aggregateManagedSources: vi.fn().mockResolvedValue(undefined),
                    setReferencedAttributeSet: vi.fn(),
                },
                definition: service,
                identities: {
                    setReferencedAttributeSet: vi.fn(),
                },
                setCustomizerIndicesDir: vi.fn((dir: string) => {
                    mockServiceRegistry.customizerIndicesDir = dir
                }),
            }

            const ok = await setupPhase(mockServiceRegistry, undefined, {
                isPersistent: false,
                customizerIndicesDir: tempDir,
            })

            expect(ok).toBe(true)
            expect(mockServiceRegistry.setCustomizerIndicesDir).toHaveBeenCalledWith(tempDir)
            expect(service.isCandidateValueUnique('sAMAccountName', 'customizer_id')).toBe(false)
            expect(service.isCandidateValueUnique('sAMAccountName', 'fresh_id')).toBe(true)
        })
    })
})
