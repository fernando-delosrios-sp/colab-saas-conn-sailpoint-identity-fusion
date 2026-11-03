import * as fs from 'fs'
import * as path from 'path'

const INTERNAL_RECORD_FORMAT_VERSION = 1
const INTERNAL_RECORD_MAGIC = Buffer.from('HRB1')
export const INTERNAL_RECORD_DIRECTORY = 'internal-records'
const INTERNAL_RECORD_MANIFEST = 'manifest.json'
const INTERNAL_RECORD_IDENTITY_HEADER = 'nativeIdentity'
/** Records per shard. Fixed so two builds of the same dump produce the same files. */
const INTERNAL_RECORD_SHARD_SIZE = 10_000

export class InternalRecordFormatError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'InternalRecordFormatError'
    }
}

export interface InternalRecordSourceManifest {
    fileName: string
    headers: string[]
    recordCount: number
    shards: string[]
}

export interface InternalRecordManifest {
    formatVersion: number
    sources: InternalRecordSourceManifest[]
}

interface CsvParseState {
    inQuotes: boolean
    field: string
    fields: string[]
    row: number
    sawCr: boolean
}

/**
 * Stream a headered CSV file and invoke `onRecord` once per data row.
 * Quoted commas, doubled quotes, and embedded line breaks follow RFC 4180.
 */
export async function forEachCsvRecord(
    csvPath: string,
    onRecord: (rowNumber: number, fields: string[]) => Promise<void> | void
): Promise<void> {
    const stream = fs.createReadStream(csvPath, { encoding: 'utf8' })
    const state: CsvParseState = { inQuotes: false, field: '', fields: [], row: 1, sawCr: false }
    let quoteMayContinue = false

    const finishRecord = async () => {
        state.fields.push(state.field)
        state.field = ''
        const fields = state.fields
        const rowNumber = state.row
        state.fields = []
        state.row += 1
        if (fields.length === 1 && fields[0] === '') return
        await onRecord(rowNumber, fields)
    }

    try {
        for await (const chunk of stream) {
            const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
            for (let i = 0; i < text.length; i++) {
                const char = text[i]
                if (quoteMayContinue) {
                    quoteMayContinue = false
                    if (char === '"') {
                        state.field += '"'
                        state.sawCr = false
                        continue
                    }
                    state.inQuotes = false
                }
                if (state.inQuotes) {
                    if (char === '"') {
                        const next = text[i + 1]
                        if (next === '"') {
                            state.field += '"'
                            i++
                        } else if (next === undefined) {
                            quoteMayContinue = true
                        } else {
                            state.inQuotes = false
                        }
                    } else {
                        state.field += char
                    }
                    state.sawCr = false
                    continue
                }

                if (char === '"') {
                    state.inQuotes = true
                    state.sawCr = false
                    continue
                }
                if (char === ',') {
                    state.fields.push(state.field)
                    state.field = ''
                    state.sawCr = false
                    continue
                }
                if (char === '\n') {
                    if (state.sawCr) {
                        state.sawCr = false
                        continue
                    }
                    await finishRecord()
                    continue
                }
                if (char === '\r') {
                    state.sawCr = true
                    await finishRecord()
                    continue
                }
                state.sawCr = false
                state.field += char
            }
        }
    } finally {
        stream.destroy()
    }

    if (quoteMayContinue) {
        state.inQuotes = false
    }
    if (state.inQuotes) {
        throw new InternalRecordFormatError(
            `Malformed CSV in "${path.basename(csvPath)}" at row ${state.row}: a quoted field was not closed`
        )
    }
    if (state.field.length > 0 || state.fields.length > 0) {
        await finishRecord()
    }
}

function assertHeaders(fileName: string, headers: string[]): void {
    const seen = new Set<string>()
    for (const header of headers) {
        if (header.length === 0) {
            throw new InternalRecordFormatError(`Internal-record dump "${fileName}" has an empty header`)
        }
        if (seen.has(header)) {
            throw new InternalRecordFormatError(
                `Internal-record dump "${fileName}" has duplicate header "${header}"`
            )
        }
        seen.add(header)
    }
    if (!seen.has(INTERNAL_RECORD_IDENTITY_HEADER)) {
        throw new InternalRecordFormatError(
            `Internal-record dump "${fileName}" is missing required header "${INTERNAL_RECORD_IDENTITY_HEADER}"`
        )
    }
}

function shardName(fileName: string, index: number): string {
    const stem = fileName.replace(/\.csv$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'records'
    return `${stem}-${String(index).padStart(4, '0')}.hrb`
}

function writeFrame(chunks: Buffer[], headers: string[], values: string[]): void {
    const count = Buffer.allocUnsafe(4)
    count.writeUInt32LE(headers.length, 0)
    chunks.push(count)
    for (const value of values) {
        const bytes = Buffer.from(value, 'utf8')
        const length = Buffer.allocUnsafe(4)
        length.writeUInt32LE(bytes.length, 0)
        chunks.push(length, bytes)
    }
}

/**
 * Compile every `*.csv` internal-record dump in `recordsDir` into a manifest and binary shards.
 * The original CSV files are not copied to `outputDir`.
 */
export async function compileInternalRecordDumps(recordsDir: string, outputDir: string): Promise<InternalRecordManifest> {
    const destination = path.join(outputDir, INTERNAL_RECORD_DIRECTORY)
    fs.rmSync(destination, { recursive: true, force: true })
    fs.mkdirSync(destination, { recursive: true })

    if (!fs.existsSync(recordsDir)) {
        const empty: InternalRecordManifest = { formatVersion: INTERNAL_RECORD_FORMAT_VERSION, sources: [] }
        fs.writeFileSync(path.join(destination, INTERNAL_RECORD_MANIFEST), `${JSON.stringify(empty, null, 2)}\n`)
        return empty
    }

    const fileNames = fs
        .readdirSync(recordsDir)
        .filter((file) => file.toLowerCase().endsWith('.csv'))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    const sources: InternalRecordSourceManifest[] = []
    for (const fileName of fileNames) {
        const source = await compileOneDump(path.join(recordsDir, fileName), fileName, destination)
        sources.push(source)
    }

    const manifest: InternalRecordManifest = {
        formatVersion: INTERNAL_RECORD_FORMAT_VERSION,
        sources,
    }
    fs.writeFileSync(path.join(destination, INTERNAL_RECORD_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest
}

async function compileOneDump(csvPath: string, fileName: string, destination: string): Promise<InternalRecordSourceManifest> {
    let headers: string[] | undefined
    let recordCount = 0
    let shardIndex = 0
    let inShard = 0
    const shards: string[] = []
    let stream: fs.WriteStream | undefined
    const pending: Buffer[] = []

    const openShard = () => {
        const name = shardName(fileName, shardIndex)
        shardIndex += 1
        shards.push(name)
        inShard = 0
        stream = fs.createWriteStream(path.join(destination, name))
        stream.write(INTERNAL_RECORD_MAGIC)
    }

    const flush = async () => {
        if (!stream || pending.length === 0) return
        const payload = Buffer.concat(pending)
        pending.length = 0
        const current = stream
        await new Promise<void>((resolve, reject) => {
            current.write(payload, (error) => (error ? reject(error) : resolve()))
        })
    }

    const closeShard = async () => {
        await flush()
        if (!stream) return
        const current = stream
        stream = undefined
        await new Promise<void>((resolve, reject) => {
            current.end((error?: Error | null) => (error ? reject(error) : resolve()))
        })
    }

    try {
        await forEachCsvRecord(csvPath, async (rowNumber, fields) => {
            if (!headers) {
                headers = fields
                assertHeaders(fileName, headers)
                return
            }
            if (fields.length !== headers.length) {
                throw new InternalRecordFormatError(
                    `Internal-record dump "${fileName}" row ${rowNumber} has ${fields.length} fields; expected ${headers.length}`
                )
            }
            const identityIndex = headers.indexOf(INTERNAL_RECORD_IDENTITY_HEADER)
            if (fields[identityIndex].length === 0) {
                throw new InternalRecordFormatError(
                    `Internal-record dump "${fileName}" row ${rowNumber} is missing ${INTERNAL_RECORD_IDENTITY_HEADER}`
                )
            }
            if (!stream || inShard >= INTERNAL_RECORD_SHARD_SIZE) {
                await closeShard()
                openShard()
            }
            writeFrame(pending, headers, fields)
            inShard += 1
            recordCount += 1
            if (pending.reduce((sum, chunk) => sum + chunk.length, 0) > 64 * 1024) {
                await flush()
            }
        })
    } catch (error) {
        stream?.destroy()
        throw error
    }

    if (!headers) {
        throw new InternalRecordFormatError(`Internal-record dump "${fileName}" has no header row`)
    }
    if (!stream) {
        openShard()
    }
    await closeShard()

    return { fileName, headers, recordCount, shards }
}

export function loadInternalRecordManifest(directory: string): InternalRecordManifest {
    const manifestPath = path.join(directory, INTERNAL_RECORD_MANIFEST)
    if (!fs.existsSync(manifestPath)) {
        throw new InternalRecordFormatError(
            `Internal record package is missing ${INTERNAL_RECORD_MANIFEST} in "${directory}"`
        )
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as InternalRecordManifest
    if (manifest.formatVersion !== INTERNAL_RECORD_FORMAT_VERSION) {
        throw new InternalRecordFormatError(
            `Internal record package format version ${String(manifest.formatVersion)} is not supported. Rebuild the Records Customizer.`
        )
    }
    return manifest
}

export function findInternalRecordSource(
    manifest: InternalRecordManifest,
    fileName: string
): InternalRecordSourceManifest | undefined {
    return manifest.sources.find((source) => source.fileName === fileName)
}

/**
 * Decode one shard sequentially. The generator retains only the frame currently being parsed.
 */
async function* readInternalRecordShard(shardPath: string): AsyncGenerator<string[]> {
    const stream = fs.createReadStream(shardPath)
    let buffer = Buffer.alloc(0)
    let checkedMagic = false

    const consumeAvailable = function* (): Generator<string[]> {
        let cursor = 0
        if (!checkedMagic) {
            if (buffer.length < INTERNAL_RECORD_MAGIC.length) return
            const magic = buffer.subarray(0, INTERNAL_RECORD_MAGIC.length)
            if (!magic.equals(INTERNAL_RECORD_MAGIC)) {
                throw new InternalRecordFormatError(
                    `Internal record shard "${path.basename(shardPath)}" has an unsupported header`
                )
            }
            checkedMagic = true
            cursor = INTERNAL_RECORD_MAGIC.length
        }
        while (buffer.length - cursor >= 4) {
            const fieldCount = buffer.readUInt32LE(cursor)
            let frameEnd = cursor + 4
            const values: string[] = []
            let complete = true
            for (let i = 0; i < fieldCount; i++) {
                if (buffer.length - frameEnd < 4) {
                    complete = false
                    break
                }
                const length = buffer.readUInt32LE(frameEnd)
                frameEnd += 4
                if (buffer.length - frameEnd < length) {
                    complete = false
                    break
                }
                values.push(buffer.subarray(frameEnd, frameEnd + length).toString('utf8'))
                frameEnd += length
            }
            if (!complete) break
            cursor = frameEnd
            yield values
        }
        if (cursor > 0) buffer = buffer.subarray(cursor)
    }

    try {
        for await (const chunk of stream) {
            const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            buffer = buffer.length === 0 ? next : Buffer.concat([buffer, next])
            yield* consumeAvailable()
        }
    } finally {
        stream.destroy()
    }

    if (!checkedMagic || buffer.length > 0) {
        throw new InternalRecordFormatError(`Internal record shard "${path.basename(shardPath)}" ended inside a record`)
    }
}

export async function* iterateInternalRecords(
    directory: string,
    fileName: string
): AsyncGenerator<{ headers: string[]; values: string[] }> {
    const manifest = loadInternalRecordManifest(directory)
    const source = findInternalRecordSource(manifest, fileName)
    if (!source) {
        throw new InternalRecordFormatError(
            `Internal record file "${fileName}" is not in the customizer package. Rebuild and upload the Records Customizer with that internal-record dump.`
        )
    }
    for (const shard of source.shards) {
        for await (const values of readInternalRecordShard(path.join(directory, shard))) {
            yield { headers: source.headers, values }
        }
    }
}

export function internalRecordSourceId(fileName: string): string {
    return `internal-record:${encodeURIComponent(fileName)}`
}

export function validateConfiguredInternalRecords(
    sources: Array<{ internalRecordFile?: string }>,
    directory: string | undefined
): void {
    const configured = sources.filter(
        (source) => typeof source.internalRecordFile === 'string' && source.internalRecordFile.length > 0
    )
    if (configured.length === 0) return
    if (!directory) {
        throw new InternalRecordFormatError(internalPackageMessage(configured[0].internalRecordFile!))
    }
    const manifest = loadInternalRecordManifest(directory)
    for (const source of configured) {
        if (!findInternalRecordSource(manifest, source.internalRecordFile!)) {
            throw new InternalRecordFormatError(internalPackageMessage(source.internalRecordFile!))
        }
    }
}

export function internalPackageMessage(fileName: string): string {
    return `Internal record file "${fileName}" is not in the customizer package. Rebuild and upload the Records Customizer with that internal-record dump.`
}
