import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { performance } from 'perf_hooks'
import { fileURLToPath } from 'node:url'
import {
    compileInternalRecordDumps,
    forEachCsvRecord,
    inferInternalRecordSchema,
    INTERNAL_RECORD_DIRECTORY,
    iterateInternalRecords,
} from '../../../src/services/sourceService/internalRecordFormat.ts'

const scriptFile = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptFile)

const GENERATED_ROWS = Number(process.env.INTERNAL_RECORD_ROWS ?? 5_000)
const RESULT_PATH = path.resolve(scriptDir, '../benchmark/results.md')
const REPRESENTATIVE_FIXTURE = path.resolve(scriptDir, '../fixtures/representative-anonymized.csv')

interface Measurement {
    reader: string
    fixture: string
    records: number
    packageBytes: number
    elapsedMs: number
    recordsPerSecond: number
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
    filesystemType: string
}

function filesystemType(target: string): string {
    const realTarget = fs.realpathSync(target)
    const df = spawnSync('df', ['-P', realTarget], { encoding: 'utf8' })
    const mountPoint = df.stdout.trim().split('\n').at(-1)?.split(/\s+/).at(-1)
    if (!mountPoint) return 'unavailable'
    const mounted = spawnSync('mount', { encoding: 'utf8' })
    const line = mounted.stdout.split('\n').find((entry) => entry.includes(` on ${mountPoint} (`))
    return line?.match(/\(([^,)]+)/)?.[1] ?? 'unavailable'
}

function directoryBytes(directory: string): number {
    return fs.readdirSync(directory).reduce((sum, file) => sum + fs.statSync(path.join(directory, file)).size, 0)
}

async function writeGeneratedCsv(csvPath: string, rows: number): Promise<void> {
    const stream = fs.createWriteStream(csvPath)
    stream.write('nativeIdentity,name,employeeNumber,department\n')
    for (let i = 0; i < rows; i++) {
        stream.write(`id-${i},Person ${i},E${i},Department ${i % 25}\n`)
    }
    await new Promise<void>((resolve, reject) => {
        stream.end((error?: Error | null) => (error ? reject(error) : resolve()))
    })
}

async function measure(reader: string, fixture: string): Promise<Measurement> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-benchmark-'))
    const recordsDir = path.join(root, 'records')
    fs.mkdirSync(recordsDir)
    const sourceName = fixture === 'generated' ? 'generated.csv' : path.basename(fixture)
    const csvPath = path.join(recordsDir, sourceName)
    if (fixture === 'generated') {
        await writeGeneratedCsv(csvPath, GENERATED_ROWS)
    } else {
        fs.copyFileSync(fixture, csvPath)
    }
    let records = 0
    let packageBytes = fs.statSync(csvPath).size
    let artifactDir: string | undefined
    if (reader === 'compiled') {
        const outputDir = path.join(root, 'data')
        const inferred = await inferInternalRecordSchema(csvPath)
        await compileInternalRecordDumps(recordsDir, outputDir, {
            sources: [
                {
                    fileName: sourceName,
                    sourceName: sourceName.replace(/\.csv$/i, ''),
                    includeRecordAccountsInMatch: false,
                    accountJmespathFilter: '',
                    accountIdField: inferred.headers[0],
                    accountNameField: inferred.headers[1] ?? inferred.headers[0],
                    schema: inferred.schema,
                },
            ],
        })
        artifactDir = path.join(outputDir, INTERNAL_RECORD_DIRECTORY)
        packageBytes = directoryBytes(artifactDir)
        const collector = global as { gc?: () => void }
        collector.gc?.()
    }
    const started = performance.now()
    if (reader === 'csv') {
        await forEachCsvRecord(csvPath, async (_row, fields) => {
            if (fields[0] === 'nativeIdentity') return
            records += 1
            if (fields.length !== 4) throw new Error('unexpected generated CSV shape')
        })
    } else {
        for await (const record of iterateInternalRecords(artifactDir!, sourceName)) {
            records += 1
            if (record.values.length !== record.headers.length) throw new Error('record shape mismatch')
        }
    }
    const elapsedMs = performance.now() - started
    const memory = process.memoryUsage()
    fs.rmSync(root, { recursive: true, force: true })
    return {
        reader,
        fixture: fixture === 'generated' ? `generated-${GENERATED_ROWS}` : path.basename(fixture),
        records,
        packageBytes,
        elapsedMs: Math.round(elapsedMs),
        recordsPerSecond: Math.round((records / elapsedMs) * 1000),
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        rss: memory.rss,
        filesystemType: filesystemType(os.tmpdir()),
    }
}

function runChild(reader: string, fixture: string): Measurement {
    const result = spawnSync(
        process.execPath,
        [
            '--expose-gc',
            '--experimental-strip-types',
            '--import',
            fileURLToPath(new URL('./register-ts-specifiers.mjs', import.meta.url)),
            scriptFile,
            '--reader',
            reader,
            '--fixture',
            fixture,
        ],
        { encoding: 'utf8', env: process.env }
    )
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `benchmark reader ${reader} failed`)
    }
    const line = result.stdout.trim().split('\n').filter((entry) => entry.startsWith('{')).at(-1)
    if (!line) throw new Error(`benchmark reader ${reader} produced no measurement`)
    return JSON.parse(line) as Measurement
}

async function main(): Promise<void> {
    const readerFlag = process.argv.indexOf('--reader')
    if (readerFlag >= 0) {
        const fixtureFlag = process.argv.indexOf('--fixture')
        const fixture = process.argv[fixtureFlag + 1]
        const measurement = await measure(process.argv[readerFlag + 1], fixture === 'generated' ? 'generated' : fixture)
        process.stdout.write(`${JSON.stringify(measurement)}\n`)
        return
    }

    const measurements = [
        runChild('csv', 'generated'),
        runChild('compiled', 'generated'),
        runChild('csv', REPRESENTATIVE_FIXTURE),
        runChild('compiled', REPRESENTATIVE_FIXTURE),
    ]
    const lines = [
        '# Internal-record benchmark',
        '',
        `Generated fixture: ${GENERATED_ROWS} anonymized rows with nativeIdentity, name, employeeNumber, and department.`,
        'Representative fixture: `fixtures/representative-anonymized.csv` (5 rows, including a quoted name).',
        '',
        'Elapsed time for the compiled reader starts after packaging and a garbage collection. Package bytes include the manifest and shards. A ramfs-backed runtime filesystem does not reduce the memory budget: file pages for either format can count toward resident memory. This run is local evidence, not a deployment-ramfs measurement.',
        '',
        '| Reader | Fixture | Records | Package bytes | Elapsed ms | Records/s | Heap used | Heap total | External | RSS | Filesystem |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
        ...measurements.map(
            (measurement) =>
                `| ${measurement.reader} | ${measurement.fixture} | ${measurement.records} | ${measurement.packageBytes} | ${measurement.elapsedMs} | ${measurement.recordsPerSecond} | ${measurement.heapUsed} | ${measurement.heapTotal} | ${measurement.external} | ${measurement.rss} | ${measurement.filesystemType} |`
        ),
        '',
        'Short text rows carry a 4-byte length before every value, so the compiled artifact can be larger than the source CSV. The compiled form is the packaged source: it is validated once, does not ship the CSV, and is read one record at a time.',
        '',
    ]
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true })
    fs.writeFileSync(RESULT_PATH, lines.join('\n'))
    process.stdout.write(`Wrote ${RESULT_PATH}\n`)
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
