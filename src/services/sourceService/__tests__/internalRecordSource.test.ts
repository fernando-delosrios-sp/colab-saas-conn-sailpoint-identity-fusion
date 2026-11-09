import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { SourceType } from '../../../model/config'
import { FusionAccount } from '../../../model/fusionAccount'
import { FusionRun } from '../../../model/fusionRun'
import { readSettings } from '../../../data/config/settings/sourcesSettings'
import type { InternalRecordConfiguration } from '../internalRecordConfiguration'
import { fetchManagedAccounts } from '../managedAccountFetcher'
import { fetchAllSources } from '../sourceDiscovery'
import { compileInternalRecordDumps, INTERNAL_RECORD_DIRECTORY } from '../internalRecordFormat'

function entry(
    fileName: string,
    sourceName: string,
    overrides: Partial<InternalRecordConfiguration['sources'][number]> = {}
): InternalRecordConfiguration['sources'][number] {
    return {
        fileName,
        sourceName,
        includeRecordAccountsInMatch: overrides.includeRecordAccountsInMatch ?? false,
        accountJmespathFilter: overrides.accountJmespathFilter ?? '',
        accountIdField: overrides.accountIdField ?? 'id',
        accountNameField: overrides.accountNameField ?? 'name',
        schema: overrides.schema ?? [
            { name: 'id', multiValued: false },
            { name: 'name', multiValued: false },
            { name: 'department', multiValued: false },
            { name: 'AFFILS', multiValued: true },
        ],
    }
}

describe('Internal Record sources', () => {
    let root: string

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-source-'))
        FusionAccount.configure({ sources: [] } as any)
    })

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true })
        FusionAccount.configure({ sources: [] } as any)
    })

    it('does not read an internal-record file from Source Settings', () => {
        const result = readSettings({
            sources: [
                {
                    name: 'Workday',
                    enabled: true,
                    sourceType: SourceType.Authoritative,
                    internalRecordFile: 'Sample Records.csv',
                } as any,
            ],
        })

        expect(result.sources[0].sourceType).toBe(SourceType.Authoritative)
        expect((result.sources[0] as { internalRecordFile?: string }).internalRecordFile).toBeUndefined()
    })

    async function packageDump(csv: string, configuration: InternalRecordConfiguration): Promise<string> {
        const recordsDir = path.join(root, 'records')
        fs.mkdirSync(recordsDir, { recursive: true })
        for (const source of configuration.sources) {
            fs.writeFileSync(path.join(recordsDir, source.fileName), csv)
        }
        const outputDir = path.join(root, 'data')
        await compileInternalRecordDumps(recordsDir, outputDir, configuration)
        return path.join(outputDir, INTERNAL_RECORD_DIRECTORY)
    }

    function discoveryState(sources: Array<{ name: string; sourceType?: SourceType }>) {
        return {
            sources,
            spConnectorInstanceId: 'instance-1',
            sourcesById: new Map(),
            workgroupMemberIdsByWorkgroupId: new Map(),
            accountJmespathFiltersBySourceName: new Map(),
        }
    }

    function iscClient(sources: Array<{ id: string; name: string; connectorAttributes?: Record<string, unknown> }>) {
        return {
            call: vi.fn(async () => [
                ...sources,
                {
                    id: 'fusion-id',
                    name: 'Fusion',
                    owner: { id: 'owner-1', type: 'IDENTITY' },
                    connectorAttributes: { spConnectorInstanceId: 'instance-1' },
                },
            ]),
        }
    }

    it('Packaged configuration becomes an Internal Record source', async () => {
        const directory = await packageDump('id,name,department,AFFILS\nh-1,Ada,Engineering,staff\n', {
            sources: [entry('Sample Records.csv', 'Sample Records', { includeRecordAccountsInMatch: true })],
        })
        const run = new FusionRun()
        const call = iscClient([])
        await fetchAllSources({
            log: { debug: vi.fn(), warn: vi.fn() } as any,
            client: call as any,
            run,
            internalRecordsDir: directory,
            state: discoveryState([]),
        })

        const internal = run.sourcesByName.get('Sample Records')
        expect(internal).toMatchObject({
            sourceType: SourceType.Record,
            internalProvenance: true,
            config: { includeRecordAccountsForMatching: true },
        })
        expect(internal?.id.startsWith('internal-record:')).toBe(true)
        expect(call.call).toHaveBeenCalledTimes(1)
    })

    it('Shared name fails setup', async () => {
        const directory = await packageDump('id,name,department,AFFILS\nh-1,Ada,Engineering,staff\n', {
            sources: [entry('Sample Records.csv', 'Sample Records')],
        })
        await expect(
            fetchAllSources({
                log: { debug: vi.fn(), warn: vi.fn() } as any,
                client: iscClient([{ id: 'wd-1', name: 'Sample Records' }]) as any,
                run: new FusionRun(),
                internalRecordsDir: directory,
                state: discoveryState([{ name: 'Sample Records', sourceType: SourceType.Authoritative }]),
            })
        ).rejects.toThrow(/Sample Records/)
    })

    it('Distinct names keep the Identity Security Cloud feed', async () => {
        const directory = await packageDump('id,name,department,AFFILS\nh-1,Ada,Engineering,staff\n', {
            sources: [entry('Sample Records.csv', 'Sample Records')],
        })
        const run = new FusionRun()
        await fetchAllSources({
            log: { debug: vi.fn(), warn: vi.fn() } as any,
            client: iscClient([{ id: 'wd-1', name: 'Workday', connectorAttributes: {} }]) as any,
            run,
            internalRecordsDir: directory,
            state: discoveryState([{ name: 'Workday', sourceType: SourceType.Authoritative }]),
        })

        const workday = run.sourcesByName.get('Workday')
        expect(workday?.id).toBe('wd-1')
        expect(workday?.internalProvenance).toBeUndefined()
        expect(run.sourcesByName.get('Sample Records')?.internalProvenance).toBe(true)
    })

    it('Packaged file is absent from the manifest', async () => {
        const directory = path.join(root, INTERNAL_RECORD_DIRECTORY)
        fs.mkdirSync(directory)
        fs.writeFileSync(
            path.join(directory, 'manifest.json'),
            `${JSON.stringify({ formatVersion: 2, sources: [] })}\n`
        )
        const configuration: InternalRecordConfiguration = {
            sources: [entry('Sample Records.csv', 'Sample Records')],
        }
        fs.writeFileSync(path.join(directory, 'internal-record-configuration.json'), `${JSON.stringify(configuration)}\n`)

        await expect(
            fetchAllSources({
                log: { debug: vi.fn(), warn: vi.fn() } as any,
                client: iscClient([]) as any,
                run: new FusionRun(),
                internalRecordsDir: directory,
                state: discoveryState([]),
            })
        ).rejects.toThrow(/Sample Records\.csv/)
    })

    it('Saved filter drops non-matching rows', async () => {
        const directory = await packageDump(
            'id,name,department,AFFILS\nh-1,Ada,Engineering,staff\nh-2,Grace,Research,faculty\n',
            {
                sources: [
                    entry('Sample Records.csv', 'Sample Records', {
                        accountJmespathFilter: 'accounts[?attributes.department == `Engineering`]',
                    }),
                ],
            }
        )
        const run = new FusionRun()
        const listAccounts = vi.fn()
        const info = vi.fn()
        await fetchAllSources({
            log: { debug: vi.fn(), warn: vi.fn() } as any,
            client: iscClient([]) as any,
            run,
            internalRecordsDir: directory,
            state: discoveryState([]),
        })
        const source = run.sourcesByName.get('Sample Records')!
        await fetchManagedAccounts({
            log: {
                debug: vi.fn(),
                info,
                warn: vi.fn(),
                setFetchPopulationProgress: vi.fn(),
            } as any,
            run,
            managedSources: [source],
            batchLimitedSourceNames: new Set(),
            batchCumulativeCount: {},
            accountJmespathFiltersBySourceName: new Map(),
            internalRecordsDir: directory,
            referencedAttributeSet: new Set(['name', 'department', 'AFFILS']),
            fetchAccountsBySourceIdGenerator: listAccounts as any,
        })

        expect(info).toHaveBeenCalledWith(
            'Loading Internal Record source "Sample Records" from "Sample Records.csv" (2 accounts)'
        )
        expect(info).toHaveBeenCalledWith('Internal Record source "Sample Records": collected 1 account(s)')
        expect(listAccounts).not.toHaveBeenCalled()
        const registered = [...run.managedAccountsById.values()]
        expect(registered.map((account) => account.nativeIdentity)).toEqual(['h-1'])
        expect(registered[0].attributes).toMatchObject({ department: 'Engineering' })
    })

    it('Unquoted semicolons become a list on the account', async () => {
        const directory = await packageDump('id,name,department,AFFILS\nh-1,Ada,Engineering,staff;faculty\n', {
            sources: [entry('Sample Records.csv', 'Sample Records')],
        })
        const run = new FusionRun()
        await fetchAllSources({
            log: { debug: vi.fn(), warn: vi.fn() } as any,
            client: iscClient([]) as any,
            run,
            internalRecordsDir: directory,
            state: discoveryState([]),
        })
        await fetchManagedAccounts({
            log: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                setFetchPopulationProgress: vi.fn(),
            } as any,
            run,
            managedSources: [run.sourcesByName.get('Sample Records')!],
            batchLimitedSourceNames: new Set(),
            batchCumulativeCount: {},
            accountJmespathFiltersBySourceName: new Map(),
            internalRecordsDir: directory,
            referencedAttributeSet: new Set(['AFFILS', 'name']),
            fetchAccountsBySourceIdGenerator: vi.fn() as any,
        })
        const account = [...run.managedAccountsById.values()][0]
        expect(account.nativeIdentity).toBe('h-1')
        expect(account.name).toBe('Ada')
        expect(account.attributes?.AFFILS).toEqual(['staff', 'faculty'])
    })

    it('treats an Internal Record source as a non-contributing Record source', () => {
        FusionAccount.configure({ sources: [{ name: 'Workday', sourceType: SourceType.Authoritative }] } as any)
        FusionAccount.includeRecordSources(['Sample Records'])
        expect(FusionAccount.recordSourceNames.has('Sample Records')).toBe(true)
        expect(FusionAccount.managedSourceNames.has('Sample Records')).toBe(true)
    })
})
