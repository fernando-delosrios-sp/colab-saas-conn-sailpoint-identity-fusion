import {
    connectorCustomizer,
    resolveDataDir,
    resolveInternalRecordsDir,
    withInternalRecordsLocation,
} from '../src/index'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('Records Customizer hook', () => {
    let tempDir: string

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'records-customizer-'))
    })

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true })
    })

    it('Hook provides the Internal Record package location', async () => {
        const base = path.join(tempDir, 'packaged')
        const manifestDir = path.join(base, 'data', 'internal-records')
        fs.mkdirSync(manifestDir, { recursive: true })
        fs.writeFileSync(path.join(manifestDir, 'manifest.json'), '{"formatVersion":2,"sources":[]}\n')
        fs.writeFileSync(path.join(manifestDir, 'internal-record-configuration.json'), '{"sources":[]}\n')

        const located = withInternalRecordsLocation({ filter: 'test' }, path.join(base, 'dist'))
        expect(located.customizerInternalRecordsDir).toBe(manifestDir)
        expect(located.customizerIndicesDir).toBeUndefined()
        expect(resolveInternalRecordsDir(path.join(base, 'dist'))).toBe(manifestDir)

        const customizerInstance = await connectorCustomizer()
        const live = await customizerInstance._exec('before:std:account:list', {} as any, { filter: 'test' })
        expect(live.filter).toBe('test')
        expect(live.customizerIndicesDir).toBeUndefined()
    })

    it('Package without Internal Record artifacts remains valid', async () => {
        const bare = path.join(tempDir, 'index-only')
        expect(resolveInternalRecordsDir(bare)).toBeUndefined()
        const located = withInternalRecordsLocation({ filter: 'test' }, bare)
        expect(located.filter).toBe('test')
        expect(located.customizerInternalRecordsDir).toBeUndefined()
        expect(located.customizerIndicesDir).toBeUndefined()

        const customizerInstance = await connectorCustomizer()
        const live = await customizerInstance._exec('before:std:account:list', {} as any, { filter: 'test' })
        expect(live.filter).toBe('test')
        expect(live.customizerIndicesDir).toBeUndefined()
    })

    it('resolveDataDir prioritizes existing data directory', () => {
        const mockBase = path.join(tempDir, 'customizer-root')
        const directData = path.join(mockBase, 'data')
        fs.mkdirSync(directData, { recursive: true })
        expect(resolveDataDir(mockBase)).toBe(directData)
    })
})
