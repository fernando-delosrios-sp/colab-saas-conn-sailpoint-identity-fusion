import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { SourceType } from '../../../model/config'
import { FusionAccount } from '../../../model/fusionAccount'
import { FusionRun } from '../../../model/fusionRun'
import { readSettings } from '../../../data/config/settings/sourcesSettings'
import { fetchManagedAccounts } from '../managedAccountFetcher'
import { fetchAllSources } from '../sourceDiscovery'
import {
    compileInternalRecordDumps,
    INTERNAL_RECORD_DIRECTORY,
    validateConfiguredInternalRecords,
} from '../internalRecordFormat'

describe('Internal Record sources', () => {
    let root: string

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-source-'))
    })

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true })
        FusionAccount.configure({ sources: [] } as any)
    })

    it('reads an internal-record file as a Record source', () => {
        const result = readSettings({
            sources: [
                {
                    name: 'Internal Records.csv',
                    enabled: true,
                    sourceType: SourceType.Authoritative,
                    internalRecordFile: ' Internal Records.csv ',
                },
            ],
        })

        expect(result.sources[0].sourceType).toBe(SourceType.Record)
        expect(result.sources[0].internalRecordFile).toBe('Internal Records.csv')
        expect(result.sources[0].includeRecordAccountsForMatching).toBe(true)
    })

    it('resolves a packaged dump without an ISC source lookup or id index entry', async () => {
        const run = new FusionRun()
        const sourcesById = new Map()
        const call = vi.fn(async () => [
            {
                id: 'fusion-id',
                name: 'Fusion',
                owner: { id: 'owner-1', type: 'IDENTITY' },
                connectorAttributes: { spConnectorInstanceId: 'instance-1' },
            },
        ])
        await fetchAllSources({
            log: { debug: vi.fn(), warn: vi.fn() } as any,
            client: { call } as any,
            run,
            state: {
                sources: [
                    {
                        name: 'Internal Records.csv',
                        sourceType: SourceType.Record,
                        internalRecordFile: 'Internal Records.csv',
                    },
                ],
                spConnectorInstanceId: 'instance-1',
                sourcesById,
                workgroupMemberIdsByWorkgroupId: new Map(),
                accountJmespathFiltersBySourceName: new Map(),
            },
        })

        const internal = run.sourcesByName.get('Internal Records.csv')
        expect(internal).toMatchObject({
            sourceType: SourceType.Record,
            internalProvenance: true,
        })
        expect(sourcesById.has(internal?.id)).toBe(false)
        expect(call).toHaveBeenCalledTimes(1)
    })

    it('fails Setup when the configured file is absent from the package', () => {
        expect(() =>
            validateConfiguredInternalRecords(
                [{ internalRecordFile: 'Internal Records.csv' }],
                undefined
            )
        ).toThrow(/Internal Records\.csv/)
        expect(() =>
            validateConfiguredInternalRecords([{ internalRecordFile: 'Internal Records.csv' }], undefined)
        ).toThrow(/customizer package/)
    })

    it('streams packaged records and does not call the ISC account listing', async () => {
        const recordsDir = path.join(root, 'records')
        fs.mkdirSync(recordsDir)
        fs.writeFileSync(
            path.join(recordsDir, 'Internal Records.csv'),
            'nativeIdentity,name,department\nh-1,Ada,Engineering\nh-2,Grace,Research\n'
        )
        const outputDir = path.join(root, 'data')
        await compileInternalRecordDumps(recordsDir, outputDir)
        const run = new FusionRun()
        const listAccounts = vi.fn()
        await fetchManagedAccounts({
            log: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                setFetchPopulationProgress: vi.fn(),
            } as any,
            run,
            managedSources: [
                {
                    id: 'internal-record:Internal%20Records.csv',
                    name: 'Internal Records.csv',
                    isManaged: true,
                    sourceType: SourceType.Record,
                    internalProvenance: true,
                    config: {
                        name: 'Internal Records.csv',
                        sourceType: SourceType.Record,
                        internalRecordFile: 'Internal Records.csv',
                    },
                },
            ],
            batchLimitedSourceNames: new Set(),
            batchCumulativeCount: {},
            accountJmespathFiltersBySourceName: new Map(),
            internalRecordsDir: path.join(outputDir, INTERNAL_RECORD_DIRECTORY),
            referencedAttributeSet: new Set(['name', 'department']),
            fetchAccountsBySourceIdGenerator: listAccounts as any,
        })

        expect(listAccounts).not.toHaveBeenCalled()
        expect(run.managedAccountsById.size).toBe(2)
        const registered = [...run.managedAccountsById.values()]
        expect(registered.every((account) => account.id === undefined)).toBe(true)
        expect(registered.map((account) => account.nativeIdentity).sort()).toEqual(['h-1', 'h-2'])
        expect(Object.keys(registered[0].attributes as object).sort()).toEqual(['department', 'name'])
    })

    it('treats an Internal Record source as a non-contributing Record source', () => {
        FusionAccount.configure({
            sources: [
                {
                    name: 'Internal Records.csv',
                    sourceType: SourceType.Record,
                    internalRecordFile: 'Internal Records.csv',
                },
            ],
        } as any)
        expect(FusionAccount.recordSourceNames.has('Internal Records.csv')).toBe(true)
    })
})
