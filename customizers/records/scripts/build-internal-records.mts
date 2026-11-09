import * as path from 'path'
import { fileURLToPath } from 'node:url'
import { stdin as input } from 'process'
import { packInternalRecords, createCliInternalRecordPrompter } from '../../../src/services/sourceService/internalRecordPack.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const recordsDir = path.resolve(scriptDir, '../records')
const configurationPath = path.resolve(scriptDir, '../internal-record-configuration.json')
const outputDir = path.resolve(scriptDir, '../data')
const interactive = input.isTTY === true

packInternalRecords({
    recordsDir,
    configurationPath,
    outputDir,
    interactive,
    ...(interactive ? { prompt: createCliInternalRecordPrompter() } : {}),
})
    .then((manifest) => {
        const count = manifest.sources.reduce((sum, source) => sum + source.recordCount, 0)
        console.info(`Compiled ${manifest.sources.length} internal-record dump(s), ${count} record(s)`)
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
    })
