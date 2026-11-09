import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { InternalRecordConfiguration } from '../internalRecordConfiguration'
import { INTERNAL_RECORD_DIRECTORY, internalRecordAttributes } from '../internalRecordFormat'
import { packInternalRecords } from '../internalRecordPack'

describe('Internal Record configuration pack', () => {
    let root: string
    let recordsDir: string
    let outputDir: string
    let configurationPath: string

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-pack-'))
        recordsDir = path.join(root, 'records')
        outputDir = path.join(root, 'data')
        configurationPath = path.join(root, 'internal-record-configuration.json')
        fs.mkdirSync(recordsDir)
    })

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true })
    })

    it('Missing configuration prompts and is saved', async () => {
        fs.writeFileSync(path.join(recordsDir, 'Sample Records.csv'), 'id,name\na1,Ada\n')
        const prompt = vi.fn(async () => ({
            sourceName: 'Sample Records',
            includeRecordAccountsInMatch: true,
            accountJmespathFilter: 'accounts[?attributes.name == `Ada`]',
            accountIdField: 'id',
            accountNameField: 'name',
            schema: [
                { name: 'id', multiValued: false },
                { name: 'name', multiValued: false },
            ],
        }))

        await packInternalRecords({
            recordsDir,
            configurationPath,
            outputDir,
            interactive: true,
            prompt,
        })

        const saved = JSON.parse(fs.readFileSync(configurationPath, 'utf8')) as InternalRecordConfiguration
        expect(saved.sources[0]).toMatchObject({
            fileName: 'Sample Records.csv',
            sourceName: 'Sample Records',
            includeRecordAccountsInMatch: true,
            accountIdField: 'id',
            accountNameField: 'name',
        })
        expect(prompt).toHaveBeenCalledTimes(1)

        prompt.mockImplementation(() => {
            throw new Error('saved configuration should not prompt')
        })
        await packInternalRecords({
            recordsDir,
            configurationPath,
            outputDir,
            interactive: true,
            prompt,
        })
        expect(prompt).toHaveBeenCalledTimes(1)
    })

    it('Non-interactive pack refuses an unsaved dump', async () => {
        fs.writeFileSync(path.join(recordsDir, 'Sample Records.csv'), 'id,name\na1,Ada\n')
        await expect(
            packInternalRecords({
                recordsDir,
                configurationPath,
                outputDir,
                interactive: false,
            })
        ).rejects.toThrow(/Sample Records\.csv/)
        expect(fs.existsSync(path.join(outputDir, INTERNAL_RECORD_DIRECTORY, 'manifest.json'))).toBe(false)
    })

    it('Duplicate source name fails packaging', async () => {
        fs.writeFileSync(path.join(recordsDir, 'one.csv'), 'id,name\na1,Ada\n')
        fs.writeFileSync(path.join(recordsDir, 'two.csv'), 'id,name\nb1,Grace\n')
        const configuration: InternalRecordConfiguration = {
            sources: [
                {
                    fileName: 'one.csv',
                    sourceName: 'Sample Records',
                    includeRecordAccountsInMatch: false,
                    accountJmespathFilter: '',
                    accountIdField: 'id',
                    accountNameField: 'name',
                    schema: [
                        { name: 'id', multiValued: false },
                        { name: 'name', multiValued: false },
                    ],
                },
                {
                    fileName: 'two.csv',
                    sourceName: 'Sample Records',
                    includeRecordAccountsInMatch: false,
                    accountJmespathFilter: '',
                    accountIdField: 'id',
                    accountNameField: 'name',
                    schema: [
                        { name: 'id', multiValued: false },
                        { name: 'name', multiValued: false },
                    ],
                },
            ],
        }
        fs.writeFileSync(configurationPath, `${JSON.stringify(configuration)}\n`)
        await expect(
            packInternalRecords({
                recordsDir,
                configurationPath,
                outputDir,
                interactive: false,
            })
        ).rejects.toThrow(/Sample Records/)
        expect(fs.existsSync(path.join(outputDir, INTERNAL_RECORD_DIRECTORY, 'manifest.json'))).toBe(false)
    })

    it('Operator override is what the connector uses', () => {
        const built = internalRecordAttributes(
            {
                fileName: 'Sample Records.csv',
                sourceName: 'Sample Records',
                includeRecordAccountsInMatch: false,
                accountJmespathFilter: '',
                accountIdField: 'id',
                accountNameField: 'name',
                schema: [
                    { name: 'id', multiValued: false },
                    { name: 'name', multiValued: false },
                    { name: 'AFFILS', multiValued: false },
                ],
            },
            ['id', 'name', 'AFFILS'],
            ['a1', '', 'staff;faculty'],
            ['a1', '', 'staff;faculty']
        )
        expect(built.attributes.AFFILS).toBe('staff;faculty')
        expect(built.nativeIdentity).toBe('a1')
        expect(built.name).toBe('a1')
    })

    it('rejects an invalid Accounts JMESPath filter before packaging', async () => {
        fs.writeFileSync(path.join(recordsDir, 'Sample Records.csv'), 'id,department\na1,Engineering\n')
        const configuration: InternalRecordConfiguration = {
            sources: [
                {
                    fileName: 'Sample Records.csv',
                    sourceName: 'Sample Records',
                    includeRecordAccountsInMatch: false,
                    accountJmespathFilter: 'accounts[?',
                    accountIdField: 'id',
                    accountNameField: 'department',
                    schema: [
                        { name: 'id', multiValued: false },
                        { name: 'department', multiValued: false },
                    ],
                },
            ],
        }
        fs.writeFileSync(configurationPath, `${JSON.stringify(configuration)}\n`)
        await expect(
            packInternalRecords({
                recordsDir,
                configurationPath,
                outputDir,
                interactive: false,
            })
        ).rejects.toThrow(/JMESPath/)
        expect(fs.existsSync(path.join(outputDir, INTERNAL_RECORD_DIRECTORY, 'manifest.json'))).toBe(false)
    })
})
