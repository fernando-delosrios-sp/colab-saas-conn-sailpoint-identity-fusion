import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { InternalRecordConfiguration, InternalRecordSchemaField } from '../internalRecordConfiguration'
import {
    INTERNAL_RECORD_DIRECTORY,
    InternalRecordFormatError,
    compileInternalRecordDumps,
    createInternalRecordAccountBuilder,
    inferInternalRecordSchema,
    internalRecordAttributes,
    iterateInternalRecords,
    loadInternalRecordManifest,
    splitUnquotedSemicolons,
} from '../internalRecordFormat'
import { pruneManagedAccountAttributes } from '../referencedAttributeSet'

function configurationFor(
    fileName: string,
    headers: string[],
    overrides: {
        sourceName?: string
        accountIdField?: string
        accountNameField?: string
        accountJmespathFilter?: string
        schema?: InternalRecordSchemaField[]
    } = {}
): InternalRecordConfiguration {
    return {
        sources: [
            {
                fileName,
                sourceName: overrides.sourceName ?? 'Internal Records',
                includeRecordAccountsInMatch: false,
                accountJmespathFilter: overrides.accountJmespathFilter ?? '',
                accountIdField: overrides.accountIdField ?? headers[0],
                accountNameField: overrides.accountNameField ?? headers[1] ?? headers[0],
                schema: overrides.schema ?? headers.map((name) => ({ name, multiValued: false })),
            },
        ],
    }
}

describe('internal-record dumps', () => {
    let root: string

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-records-'))
    })

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true })
    })

    it('Headered dump compiles deterministically', async () => {
        const recordsDir = path.join(root, 'records')
        const outputDir = path.join(root, 'data')
        fs.mkdirSync(recordsDir)
        const csv = ['nativeIdentity,name,note', 'n-1,"Ada, Lovelace","line', 'break"', 'n-2,Grace,', ''].join('\n')
        const fileName = 'Internal Records.csv'
        fs.writeFileSync(path.join(recordsDir, fileName), csv)
        const configuration = configurationFor(fileName, ['nativeIdentity', 'name', 'note'])

        const first = await compileInternalRecordDumps(recordsDir, outputDir, configuration)
        const firstBytes = fs.readFileSync(path.join(outputDir, INTERNAL_RECORD_DIRECTORY, first.sources[0].shards[0]))
        const second = await compileInternalRecordDumps(recordsDir, outputDir, configuration)
        const secondBytes = fs.readFileSync(
            path.join(outputDir, INTERNAL_RECORD_DIRECTORY, second.sources[0].shards[0])
        )

        expect(second).toEqual(first)
        expect(secondBytes.equals(firstBytes)).toBe(true)
        expect(fs.existsSync(path.join(outputDir, INTERNAL_RECORD_DIRECTORY, 'Internal Records.csv'))).toBe(false)
        expect(
            fs.existsSync(path.join(outputDir, INTERNAL_RECORD_DIRECTORY, 'internal-record-configuration.json'))
        ).toBe(true)
        expect(first.sources[0]).toMatchObject({
            fileName: 'Internal Records.csv',
            headers: ['nativeIdentity', 'name', 'note'],
            recordCount: 2,
        })

        const rows: string[][] = []
        for await (const record of iterateInternalRecords(
            path.join(outputDir, INTERNAL_RECORD_DIRECTORY),
            'Internal Records.csv'
        )) {
            rows.push(record.values)
        }
        expect(rows).toEqual([
            ['n-1', 'Ada, Lovelace', 'line\nbreak'],
            ['n-2', 'Grace', ''],
        ])
    })

    it('Invalid dump fails with file context', async () => {
        const recordsDir = path.join(root, 'records')
        const outputDir = path.join(root, 'data')
        fs.mkdirSync(recordsDir)
        const fileName = 'Internal Records.csv'
        fs.writeFileSync(path.join(recordsDir, fileName), 'nativeIdentity,name\n"open,value\n')
        await expect(
            compileInternalRecordDumps(recordsDir, outputDir, configurationFor(fileName, ['nativeIdentity', 'name']))
        ).rejects.toThrow(/Internal Records\.csv/)

        fs.writeFileSync(path.join(recordsDir, fileName), 'nativeIdentity,nativeIdentity\na,b\n')
        await expect(
            compileInternalRecordDumps(recordsDir, outputDir, configurationFor(fileName, ['nativeIdentity', 'name']))
        ).rejects.toBeInstanceOf(InternalRecordFormatError)
        await expect(
            compileInternalRecordDumps(recordsDir, outputDir, configurationFor(fileName, ['nativeIdentity', 'name']))
        ).rejects.toThrow(/duplicate header "nativeIdentity"/)

        fs.writeFileSync(path.join(recordsDir, fileName), 'id,name\n,Ada\n')
        await expect(
            compileInternalRecordDumps(
                recordsDir,
                outputDir,
                configurationFor(fileName, ['id', 'name'], { accountIdField: 'id' })
            )
        ).rejects.toThrow(/Internal Records\.csv.*row 2.*blank Account ID/)

        fs.writeFileSync(path.join(recordsDir, fileName), 'id,name\na1,Ada\na1,Grace\n')
        await expect(
            compileInternalRecordDumps(
                recordsDir,
                outputDir,
                configurationFor(fileName, ['id', 'name'], { accountIdField: 'id' })
            )
        ).rejects.toThrow(/Internal Records\.csv.*row 3.*duplicate Account ID "a1"/)
    })

    it('rejects an unsupported manifest version', async () => {
        const directory = path.join(root, INTERNAL_RECORD_DIRECTORY)
        fs.mkdirSync(directory)
        fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ formatVersion: 99, sources: [] }))
        expect(() => loadInternalRecordManifest(directory)).toThrow(/format version 99 is not supported/)
    })

    it('Large artifact streams through bounded processing', async () => {
        const recordsDir = path.join(root, 'records')
        fs.mkdirSync(recordsDir)
        const lines = ['nativeIdentity,name']
        for (let i = 0; i < 250; i++) lines.push(`id-${i},Person ${i}`)
        const fileName = 'Internal Records.csv'
        fs.writeFileSync(path.join(recordsDir, fileName), `${lines.join('\n')}\n`)
        const manifest = await compileInternalRecordDumps(
            recordsDir,
            path.join(root, 'data'),
            configurationFor(fileName, ['nativeIdentity', 'name'])
        )
        const entry = configurationFor(fileName, ['nativeIdentity', 'name']).sources[0]
        const referenced = new Set(['name'])
        const iterator = iterateInternalRecords(path.join(root, 'data', INTERNAL_RECORD_DIRECTORY), fileName)
        let count = 0
        let last = ''
        for await (const record of iterator) {
            const built = internalRecordAttributes(entry, record.headers, record.values, record.rawValues)
            const account = { attributes: { ...built.attributes } } as any
            pruneManagedAccountAttributes(account, referenced)
            expect(built.nativeIdentity).toBe(record.values[0])
            expect(built.name).toBe(record.values[1])
            expect(account.attributes).toEqual({ name: record.values[1] })
            last = built.nativeIdentity
            count += 1
        }
        expect(count).toBe(manifest.sources[0].recordCount)
        expect(last).toBe('id-249')
        expect(Array.isArray((iterator as { records?: unknown }).records)).toBe(false)
    })

    it('Unquoted semicolon marks a field multi-valued', async () => {
        const csvPath = path.join(root, 'affils.csv')
        fs.writeFileSync(csvPath, 'AFFILS,NOTES\nstaff;faculty,plain\n')
        const inferred = await inferInternalRecordSchema(csvPath)
        expect(inferred.schema.find((field) => field.name === 'AFFILS')?.multiValued).toBe(true)
    })

    it('Quoted semicolon stays a single value', async () => {
        const csvPath = path.join(root, 'notes.csv')
        fs.writeFileSync(csvPath, 'NOTES\n"keep;this"\n')
        const inferred = await inferInternalRecordSchema(csvPath)
        expect(inferred.schema).toEqual([{ name: 'NOTES', multiValued: false }])
        expect(splitUnquotedSemicolons('"keep;this"')).toEqual(['keep;this'])
    })

    it('Unquoted semicolons become a list', () => {
        expect(splitUnquotedSemicolons('staff;faculty')).toEqual(['staff', 'faculty'])
        expect(splitUnquotedSemicolons('staff;;faculty')).toEqual(['staff', 'faculty'])
    })

    it('Quoted semicolon remains one list entry', () => {
        expect(splitUnquotedSemicolons('"hello;world";staff')).toEqual(['hello;world', 'staff'])
        const built = internalRecordAttributes(
            {
                fileName: 'notes.csv',
                sourceName: 'Notes',
                includeRecordAccountsInMatch: false,
                accountJmespathFilter: '',
                accountIdField: 'id',
                accountNameField: 'NOTES',
                schema: [
                    { name: 'id', multiValued: false },
                    { name: 'NOTES', multiValued: true },
                ],
            },
            ['id', 'NOTES'],
            ['n-1', 'hello;world'],
            ['n-1', '"hello;world"']
        )
        expect(built.attributes.NOTES).toEqual(['hello;world'])
    })

    describe('account builder', () => {
        const entry = {
            fileName: 'people.csv',
            sourceName: 'People',
            includeRecordAccountsInMatch: false,
            accountJmespathFilter: '',
            accountIdField: 'id',
            accountNameField: 'name',
            schema: [
                { name: 'id', multiValued: false },
                { name: 'name', multiValued: false },
                { name: 'DEPT', multiValued: false },
                { name: 'AFFILS', multiValued: true },
                { name: 'EXTRA', multiValued: false },
            ],
        }
        const headers = ['id', 'name', 'DEPT', 'AFFILS', 'EXTRA']

        it('builds only the kept columns and still reads Account ID and Name from the full record', () => {
            const build = createInternalRecordAccountBuilder(entry, headers, new Set(['DEPT', 'AFFILS']))
            const built = build(['p-1', 'Pat', 'IT', 'staff;faculty', 'x'], ['p-1', 'Pat', 'IT', 'staff;faculty', 'x'])

            expect(built.nativeIdentity).toBe('p-1')
            expect(built.name).toBe('Pat')
            expect(built.attributes).toEqual({ DEPT: 'IT', AFFILS: ['staff', 'faculty'] })
        })

        it('falls back to the Account ID when the Account Name is empty', () => {
            const build = createInternalRecordAccountBuilder(entry, headers)
            const built = build(['p-2', '', 'HR', '', 'y'], ['p-2', '', 'HR', '', 'y'])

            expect(built.name).toBe('p-2')
            expect(built.attributes.EXTRA).toBe('y')
        })

        it('keeps a header named __proto__ as an own attribute', () => {
            const protoEntry = {
                ...entry,
                accountIdField: 'id',
                accountNameField: 'id',
                schema: [
                    { name: 'id', multiValued: false },
                    { name: '__proto__', multiValued: false },
                ],
            }
            const build = createInternalRecordAccountBuilder(protoEntry, ['id', '__proto__'])
            const built = build(['p-5', 'v'], ['p-5', 'v'])

            expect(Object.keys(built.attributes).sort()).toEqual(['__proto__', 'id'])
        })
    })
})
