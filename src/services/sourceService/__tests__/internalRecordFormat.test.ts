import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
    INTERNAL_RECORD_DIRECTORY,
    InternalRecordFormatError,
    compileInternalRecordDumps,
    iterateInternalRecords,
    loadInternalRecordManifest,
} from '../internalRecordFormat'

describe('internal-record dumps', () => {
    let root: string

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-records-'))
    })

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true })
    })

    it('compiles a headered dump deterministically and reconstructs quoted values', async () => {
        const recordsDir = path.join(root, 'records')
        const outputDir = path.join(root, 'data')
        fs.mkdirSync(recordsDir)
        const csv = [
            'nativeIdentity,name,note',
            'n-1,"Ada, Lovelace","line',
            'break"',
            'n-2,Grace,',
            '',
        ].join('\n')
        fs.writeFileSync(path.join(recordsDir, 'Internal Records.csv'), csv)

        const first = await compileInternalRecordDumps(recordsDir, outputDir)
        const firstBytes = fs.readFileSync(
            path.join(outputDir, INTERNAL_RECORD_DIRECTORY, first.sources[0].shards[0])
        )
        const second = await compileInternalRecordDumps(recordsDir, outputDir)
        const secondBytes = fs.readFileSync(
            path.join(outputDir, INTERNAL_RECORD_DIRECTORY, second.sources[0].shards[0])
        )

        expect(second).toEqual(first)
        expect(secondBytes.equals(firstBytes)).toBe(true)
        expect(fs.existsSync(path.join(outputDir, INTERNAL_RECORD_DIRECTORY, 'Internal Records.csv'))).toBe(false)
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

    it('fails malformed CSV and duplicate headers with the file name', async () => {
        const recordsDir = path.join(root, 'records')
        fs.mkdirSync(recordsDir)
        fs.writeFileSync(path.join(recordsDir, 'Internal Records.csv'), 'nativeIdentity,name\n"open,value\n')
        await expect(compileInternalRecordDumps(recordsDir, path.join(root, 'data'))).rejects.toThrow(
            /Internal Records\.csv/
        )

        fs.writeFileSync(path.join(recordsDir, 'Internal Records.csv'), 'nativeIdentity,nativeIdentity\na,b\n')
        await expect(compileInternalRecordDumps(recordsDir, path.join(root, 'data'))).rejects.toBeInstanceOf(
            InternalRecordFormatError
        )
        await expect(compileInternalRecordDumps(recordsDir, path.join(root, 'data'))).rejects.toThrow(
            /duplicate header "nativeIdentity"/
        )
    })

    it('rejects an unsupported manifest version', async () => {
        const directory = path.join(root, INTERNAL_RECORD_DIRECTORY)
        fs.mkdirSync(directory)
        fs.writeFileSync(
            path.join(directory, 'manifest.json'),
            JSON.stringify({ formatVersion: 99, sources: [] })
        )
        expect(() => loadInternalRecordManifest(directory)).toThrow(/format version 99 is not supported/)
    })

    it('streams records without retaining every decoded row', async () => {
        const recordsDir = path.join(root, 'records')
        fs.mkdirSync(recordsDir)
        const lines = ['nativeIdentity,name']
        for (let i = 0; i < 250; i++) lines.push(`id-${i},Person ${i}`)
        fs.writeFileSync(path.join(recordsDir, 'Internal Records.csv'), `${lines.join('\n')}\n`)
        const manifest = await compileInternalRecordDumps(recordsDir, path.join(root, 'data'))
        const iterator = iterateInternalRecords(
            path.join(root, 'data', INTERNAL_RECORD_DIRECTORY),
            'Internal Records.csv'
        )
        const first = await iterator.next()
        expect(first.value.values[0]).toBe('id-0')
        let count = 1
        let last = first.value.values[0]
        for await (const record of iterator) {
            count += 1
            last = record.values[0]
        }
        expect(count).toBe(manifest.sources[0].recordCount)
        expect(last).toBe('id-249')
        expect(Array.isArray((iterator as { records?: unknown }).records)).toBe(false)
    })
})
