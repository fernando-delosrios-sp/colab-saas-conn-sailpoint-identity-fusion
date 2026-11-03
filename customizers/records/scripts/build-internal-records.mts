import * as path from 'path'
import { fileURLToPath } from 'node:url'
import { compileInternalRecordDumps } from '../../../src/services/sourceService/internalRecordFormat.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const recordsDir = path.resolve(scriptDir, '../records')
const outputDir = path.resolve(scriptDir, '../data')

compileInternalRecordDumps(recordsDir, outputDir)
    .then((manifest) => {
        const count = manifest.sources.reduce((sum, source) => sum + source.recordCount, 0)
        console.info(`Compiled ${manifest.sources.length} internal-record dump(s), ${count} record(s)`)
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
    })
