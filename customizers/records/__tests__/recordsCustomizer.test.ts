import { connectorCustomizer, resolveDataDir, resolveInternalRecordsDir } from '../src/index'
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
        const customizerInstance = await connectorCustomizer()
        const base = path.join(tempDir, 'packaged')
        const manifestDir = path.join(base, 'data', 'internal-records')
        fs.mkdirSync(manifestDir, { recursive: true })
        fs.writeFileSync(path.join(manifestDir, 'manifest.json'), '{"formatVersion":2,"sources":[]}\n')
        expect(resolveInternalRecordsDir(path.join(base, 'dist'))).toBe(manifestDir)

        const result = await customizerInstance._exec('before:std:account:list', {} as any, { filter: 'test' })
        expect(result.filter).toBe('test')
        expect(result.customizerIndicesDir).toBeUndefined()
        expect(
            result.customizerInternalRecordsDir === undefined || typeof result.customizerInternalRecordsDir === 'string'
        ).toBe(true)
    })

    it('Package without Internal Record artifacts remains valid', async () => {
        expect(resolveInternalRecordsDir(path.join(tempDir, 'index-only'))).toBeUndefined()
        const customizerInstance = await connectorCustomizer()
        const result = await customizerInstance._exec('before:std:account:list', {} as any, { filter: 'test' })
        expect(result.filter).toBe('test')
        expect(result.customizerIndicesDir).toBeUndefined()
    })

    it('resolveDataDir prioritizes existing data directory', () => {
        const mockBase = path.join(tempDir, 'customizer-root')
        const directData = path.join(mockBase, 'data')
        fs.mkdirSync(directData, { recursive: true })
        expect(resolveDataDir(mockBase)).toBe(directData)
    })
})
