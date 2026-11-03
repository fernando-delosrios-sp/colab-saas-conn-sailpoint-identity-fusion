import * as path from 'path'
import { fileURLToPath } from 'node:url'
import { compileHistoricalRecordDumps } from '../../../src/services/sourceService/historicalRecordFormat.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const recordsDir = path.resolve(scriptDir, '../records')
const outputDir = path.resolve(scriptDir, '../data')

compileHistoricalRecordDumps(recordsDir, outputDir)
    .then((manifest) => {
        const count = manifest.sources.reduce((sum, source) => sum + source.recordCount, 0)
        console.info(`Compiled ${manifest.sources.length} historical-record dump(s), ${count} record(s)`)
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
    })
