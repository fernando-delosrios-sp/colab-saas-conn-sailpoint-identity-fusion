import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import {
    type InternalRecordConfiguration,
    type InternalRecordConfigurationEntry,
    type InternalRecordPrompter,
    type InternalRecordSchemaField,
} from './internalRecordConfiguration'
import {
    InternalRecordFormatError,
    type InternalRecordManifest,
    compileInternalRecordDumps,
    inferInternalRecordSchema,
} from './internalRecordFormat'

export interface PackInternalRecordsOptions {
    recordsDir: string
    /** Saved Internal Record configuration. Created when the first dump is confirmed. */
    configurationPath: string
    outputDir: string
    /** When false, a dump with no saved entry fails the pack. */
    interactive: boolean
    prompt?: InternalRecordPrompter
}

function readSavedConfiguration(configurationPath: string): InternalRecordConfiguration {
    if (!fs.existsSync(configurationPath)) return { sources: [] }
    const parsed = JSON.parse(fs.readFileSync(configurationPath, 'utf8')) as InternalRecordConfiguration
    if (!parsed || !Array.isArray(parsed.sources)) {
        throw new InternalRecordFormatError(
            `Internal Record configuration "${configurationPath}" must contain a sources array`
        )
    }
    return parsed
}

function writeSavedConfiguration(configurationPath: string, configuration: InternalRecordConfiguration): void {
    const sorted: InternalRecordConfiguration = {
        sources: [...configuration.sources].sort((a, b) =>
            a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0
        ),
    }
    fs.mkdirSync(path.dirname(configurationPath), { recursive: true })
    fs.writeFileSync(configurationPath, `${JSON.stringify(sorted, null, 2)}\n`)
}

function listDumpFileNames(recordsDir: string): string[] {
    if (!fs.existsSync(recordsDir)) return []
    return fs
        .readdirSync(recordsDir)
        .filter((file) => file.toLowerCase().endsWith('.csv'))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Prompt for each `records/*.csv` that has no saved entry, then compile the dumps.
 * A non-interactive pack fails before a zip when any dump is unsaved.
 * Saved entries are reused. The saved file is what the operator reviews between packs.
 */
export async function packInternalRecords(options: PackInternalRecordsOptions): Promise<InternalRecordManifest> {
    const configuration = readSavedConfiguration(options.configurationPath)
    const byFile = new Map(configuration.sources.map((entry) => [entry.fileName, entry]))
    const fileNames = listDumpFileNames(options.recordsDir)
    let changed = false

    for (const fileName of fileNames) {
        if (byFile.has(fileName)) continue
        if (!options.interactive) {
            throw new InternalRecordFormatError(
                `Internal-record dump "${fileName}" has no saved Internal Record configuration`
            )
        }
        const prompt = options.prompt
        if (!prompt) {
            throw new InternalRecordFormatError(
                `Internal-record dump "${fileName}" has no saved Internal Record configuration`
            )
        }
        const csvPath = path.join(options.recordsDir, fileName)
        const scanned = await inferInternalRecordSchema(csvPath)
        const answers = await prompt({
            fileName,
            headers: scanned.headers,
            schema: scanned.schema,
            rescan: async () => inferInternalRecordSchema(csvPath),
        })
        const entry: InternalRecordConfigurationEntry = {
            fileName,
            sourceName: answers.sourceName,
            includeRecordAccountsInMatch: answers.includeRecordAccountsInMatch,
            accountJmespathFilter: answers.accountJmespathFilter,
            accountIdField: answers.accountIdField,
            accountNameField: answers.accountNameField,
            schema: answers.schema,
        }
        byFile.set(fileName, entry)
        changed = true
    }

    const next: InternalRecordConfiguration = { sources: [...byFile.values()] }
    if (changed) writeSavedConfiguration(options.configurationPath, next)
    return compileInternalRecordDumps(options.recordsDir, options.outputDir, next)
}

/**
 * Interactive prompt for a terminal pack.
 * The operator can flip a multi-valued flag or edit the CSV and re-scan before the answers are saved.
 */
export function createCliInternalRecordPrompter(): InternalRecordPrompter {
    return async (context) => {
        const rl = readline.createInterface({ input, output })
        try {
            let headers = context.headers
            let schema: InternalRecordSchemaField[] = context.schema.map((field) => ({ ...field }))
            output.write(`\nInternal-record dump "${context.fileName}" has no saved Internal Record configuration.\n`)
            for (;;) {
                output.write('Inferred Internal Record schema:\n')
                for (const field of schema) {
                    output.write(`  ${field.name}: ${field.multiValued ? 'multi-valued' : 'single-valued'}\n`)
                }
                const command = (await rl.question('toggle <field>, rescan, or continue: ')).trim()
                if (command === 'continue' || command.length === 0) break
                if (command === 'rescan') {
                    const scanned = await context.rescan()
                    headers = scanned.headers
                    schema = scanned.schema.map((field) => ({ ...field }))
                    continue
                }
                if (command.startsWith('toggle ')) {
                    const name = command.slice('toggle '.length).trim()
                    const field = schema.find((candidate) => candidate.name === name)
                    if (!field) {
                        output.write(`Unknown field "${name}".\n`)
                        continue
                    }
                    field.multiValued = !field.multiValued
                    continue
                }
                output.write('Use toggle <field>, rescan, or continue.\n')
            }

            const defaultSourceName = context.fileName.replace(/\.csv$/i, '')
            const sourceNameAnswer = (await rl.question(`Source name [${defaultSourceName}]: `)).trim()
            const sourceName = sourceNameAnswer.length > 0 ? sourceNameAnswer : defaultSourceName
            const matchAnswer = (await rl.question('Include record accounts in Match? [y/n]: ')).trim().toLowerCase()
            const accountJmespathFilter = (await rl.question('Accounts JMESPath filter: ')).trim()
            const accountIdField = (await rl.question('Account ID field: ')).trim()
            const accountNameField = (await rl.question('Account Name field: ')).trim()
            if (sourceName.length === 0) {
                throw new InternalRecordFormatError(`Internal-record dump "${context.fileName}" needs a source name`)
            }
            if (!headers.includes(accountIdField)) {
                throw new InternalRecordFormatError(
                    `Internal-record dump "${context.fileName}" is missing Account ID field "${accountIdField}"`
                )
            }
            if (!headers.includes(accountNameField)) {
                throw new InternalRecordFormatError(
                    `Internal-record dump "${context.fileName}" is missing Account Name field "${accountNameField}"`
                )
            }
            return {
                sourceName,
                includeRecordAccountsInMatch: matchAnswer === 'y' || matchAnswer === 'yes',
                accountJmespathFilter,
                accountIdField,
                accountNameField,
                schema,
            }
        } finally {
            rl.close()
        }
    }
}
