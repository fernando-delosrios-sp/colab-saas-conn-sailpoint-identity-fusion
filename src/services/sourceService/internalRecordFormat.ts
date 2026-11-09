import * as fs from 'fs'
import * as path from 'path'
import { compileAccountPageJmespathFilter } from './accountFilters'
import {
    INTERNAL_RECORD_CONFIGURATION_FILE,
    type InternalRecordConfiguration,
    type InternalRecordConfigurationEntry,
    type InternalRecordSchemaField,
} from './internalRecordConfiguration'

const INTERNAL_RECORD_FORMAT_VERSION = 2
const INTERNAL_RECORD_MAGIC = Buffer.from('HRB1')
export const INTERNAL_RECORD_DIRECTORY = 'internal-records'
const INTERNAL_RECORD_MANIFEST = 'manifest.json'
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

/** One CSV cell, keeping the raw text so a later split can tell quoted semicolons from unquoted ones. */
interface CsvField {
    value: string
    raw: string
    unquotedSemicolon: boolean
}

interface CsvParseState {
    inQuotes: boolean
    field: string
    raw: string
    unquotedSemicolon: boolean
    fields: CsvField[]
    row: number
    sawCr: boolean
}

function pushField(state: CsvParseState): void {
    state.fields.push({
        value: state.field,
        raw: state.raw,
        unquotedSemicolon: state.unquotedSemicolon,
    })
    state.field = ''
    state.raw = ''
    state.unquotedSemicolon = false
}

/**
 * Stream a headered CSV file and invoke `onRecord` once per data row.
 * Quoted commas, doubled quotes, and embedded line breaks follow RFC 4180.
 * Each cell keeps its raw text and whether it contained an unquoted semicolon.
 */
async function forEachCsvRecordDetailed(
    csvPath: string,
    onRecord: (rowNumber: number, fields: CsvField[]) => Promise<void> | void
): Promise<void> {
    const stream = fs.createReadStream(csvPath, { encoding: 'utf8' })
    const state: CsvParseState = {
        inQuotes: false,
        field: '',
        raw: '',
        unquotedSemicolon: false,
        fields: [],
        row: 1,
        sawCr: false,
    }
    let quoteMayContinue = false

    const finishRecord = async () => {
        pushField(state)
        const fields = state.fields
        const rowNumber = state.row
        state.fields = []
        state.row += 1
        if (fields.length === 1 && fields[0].value === '' && fields[0].raw === '') return
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
                        state.raw += '"'
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
                            state.raw += '""'
                            i++
                        } else if (next === undefined) {
                            state.raw += '"'
                            quoteMayContinue = true
                        } else {
                            state.raw += '"'
                            state.inQuotes = false
                        }
                    } else {
                        state.field += char
                        state.raw += char
                    }
                    state.sawCr = false
                    continue
                }

                if (char === '"') {
                    state.inQuotes = true
                    state.raw += '"'
                    state.sawCr = false
                    continue
                }
                if (char === ',') {
                    pushField(state)
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
                if (char === ';') state.unquotedSemicolon = true
                state.sawCr = false
                state.field += char
                state.raw += char
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
    if (state.field.length > 0 || state.raw.length > 0 || state.fields.length > 0) {
        await finishRecord()
    }
}

/**
 * Stream a headered CSV file and invoke `onRecord` once per data row.
 * Quoted commas, doubled quotes, and embedded line breaks follow RFC 4180.
 */
export async function forEachCsvRecord(
    csvPath: string,
    onRecord: (rowNumber: number, fields: string[]) => Promise<void> | void
): Promise<void> {
    await forEachCsvRecordDetailed(csvPath, async (rowNumber, fields) => {
        await onRecord(
            rowNumber,
            fields.map((field) => field.value)
        )
    })
}

/** Turn one raw CSV cell back into its parsed text. */
function unescapeCsvField(raw: string): string {
    let out = ''
    let inQuotes = false
    for (let i = 0; i < raw.length; i++) {
        const char = raw[i]
        if (inQuotes) {
            if (char === '"') {
                if (raw[i + 1] === '"') {
                    out += '"'
                    i++
                } else {
                    inQuotes = false
                }
            } else {
                out += char
            }
            continue
        }
        if (char === '"') {
            inQuotes = true
            continue
        }
        out += char
    }
    return out
}

/**
 * Split a raw CSV cell on semicolons that sit outside quotes.
 * A quoted semicolon stays inside one entry. Empty entries are dropped.
 */
export function splitUnquotedSemicolons(raw: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < raw.length; i++) {
        const char = raw[i]
        if (inQuotes) {
            current += char
            if (char === '"') {
                if (raw[i + 1] === '"') {
                    current += '"'
                    i++
                } else {
                    inQuotes = false
                }
            }
            continue
        }
        if (char === '"') {
            current += char
            inQuotes = true
            continue
        }
        if (char === ';') {
            parts.push(current)
            current = ''
            continue
        }
        current += char
    }
    parts.push(current)
    return parts.map((part) => unescapeCsvField(part)).filter((part) => part.length > 0)
}

/**
 * Infer one schema field per header.
 * A field starts multi-valued when any cell contains an unquoted semicolon.
 */
export async function inferInternalRecordSchema(
    csvPath: string
): Promise<{ headers: string[]; schema: InternalRecordSchemaField[] }> {
    const fileName = path.basename(csvPath)
    let headers: string[] | undefined
    const unquoted = new Set<string>()
    await forEachCsvRecordDetailed(csvPath, (rowNumber, fields) => {
        if (!headers) {
            headers = fields.map((field) => field.value)
            assertHeaders(fileName, headers)
            return
        }
        if (fields.length !== headers.length) {
            throw new InternalRecordFormatError(
                `Internal-record dump "${fileName}" row ${rowNumber} has ${fields.length} fields; expected ${headers.length}`
            )
        }
        fields.forEach((field, index) => {
            if (field.unquotedSemicolon) unquoted.add(headers![index])
        })
    })
    if (!headers) {
        throw new InternalRecordFormatError(`Internal-record dump "${fileName}" has no header row`)
    }
    return {
        headers,
        schema: headers.map((name) => ({ name, multiValued: unquoted.has(name) })),
    }
}

function assertHeaders(fileName: string, headers: string[]): void {
    const seen = new Set<string>()
    for (const header of headers) {
        if (header.length === 0) {
            throw new InternalRecordFormatError(`Internal-record dump "${fileName}" has an empty header`)
        }
        if (seen.has(header)) {
            throw new InternalRecordFormatError(`Internal-record dump "${fileName}" has duplicate header "${header}"`)
        }
        seen.add(header)
    }
}

function shardName(fileName: string, index: number): string {
    const stem =
        fileName
            .replace(/\.csv$/i, '')
            .replace(/[^A-Za-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'records'
    return `${stem}-${String(index).padStart(4, '0')}.hrb`
}

function writeFrame(chunks: Buffer[], values: string[]): void {
    const count = Buffer.allocUnsafe(4)
    count.writeUInt32LE(values.length, 0)
    chunks.push(count)
    for (const value of values) {
        const bytes = Buffer.from(value, 'utf8')
        const length = Buffer.allocUnsafe(4)
        length.writeUInt32LE(bytes.length, 0)
        chunks.push(length, bytes)
    }
}

function listDumpFileNames(recordsDir: string): string[] {
    if (!fs.existsSync(recordsDir)) return []
    return fs
        .readdirSync(recordsDir)
        .filter((file) => file.toLowerCase().endsWith('.csv'))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function assertConfiguration(
    configuration: InternalRecordConfiguration,
    fileNames: string[]
): Map<string, InternalRecordConfigurationEntry> {
    const byFile = new Map<string, InternalRecordConfigurationEntry>()
    const sourceNames = new Set<string>()
    for (const entry of configuration.sources) {
        if (byFile.has(entry.fileName)) {
            throw new InternalRecordFormatError(
                `Internal-record dump "${entry.fileName}" has more than one saved Internal Record configuration`
            )
        }
        byFile.set(entry.fileName, entry)
        if (sourceNames.has(entry.sourceName)) {
            throw new InternalRecordFormatError(
                `Internal Record source "${entry.sourceName}" is used by more than one dump`
            )
        }
        sourceNames.add(entry.sourceName)
        compileAccountPageJmespathFilter(entry.sourceName, entry.accountJmespathFilter)
    }
    for (const fileName of fileNames) {
        if (!byFile.has(fileName)) {
            throw new InternalRecordFormatError(
                `Internal-record dump "${fileName}" has no saved Internal Record configuration`
            )
        }
    }
    return byFile
}

/**
 * Compile each configured Internal-record dump into a manifest and binary shards.
 * The original CSV files are not copied. The saved configuration is written beside the manifest.
 * Shard frames store raw CSV cells so the connector can split unquoted semicolons later.
 */
export async function compileInternalRecordDumps(
    recordsDir: string,
    outputDir: string,
    configuration: InternalRecordConfiguration
): Promise<InternalRecordManifest> {
    const fileNames = listDumpFileNames(recordsDir)
    const byFile = assertConfiguration(configuration, fileNames)
    const destination = path.join(outputDir, INTERNAL_RECORD_DIRECTORY)
    fs.rmSync(destination, { recursive: true, force: true })
    fs.mkdirSync(destination, { recursive: true })

    const sources: InternalRecordSourceManifest[] = []
    for (const fileName of fileNames) {
        const entry = byFile.get(fileName)
        if (!entry) continue
        const source = await compileOneDump(path.join(recordsDir, fileName), entry, destination)
        sources.push(source)
    }

    const manifest: InternalRecordManifest = {
        formatVersion: INTERNAL_RECORD_FORMAT_VERSION,
        sources,
    }
    fs.writeFileSync(path.join(destination, INTERNAL_RECORD_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
    fs.writeFileSync(
        path.join(destination, INTERNAL_RECORD_CONFIGURATION_FILE),
        `${JSON.stringify(configuration, null, 2)}\n`
    )
    return manifest
}

async function compileOneDump(
    csvPath: string,
    entry: InternalRecordConfigurationEntry,
    destination: string
): Promise<InternalRecordSourceManifest> {
    const fileName = entry.fileName
    let headers: string[] | undefined
    let identityIndex = -1
    const seenIds = new Set<string>()
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
        stream.on('error', () => undefined)
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
        await forEachCsvRecordDetailed(csvPath, async (rowNumber, fields) => {
            if (!headers) {
                headers = fields.map((field) => field.value)
                assertHeaders(fileName, headers)
                const schemaNames = entry.schema.map((field) => field.name)
                if (
                    headers.length !== schemaNames.length ||
                    headers.some((header, index) => header !== schemaNames[index])
                ) {
                    throw new InternalRecordFormatError(
                        `Internal-record dump "${fileName}" headers do not match the saved Internal Record schema`
                    )
                }
                identityIndex = headers.indexOf(entry.accountIdField)
                if (identityIndex < 0) {
                    throw new InternalRecordFormatError(
                        `Internal-record dump "${fileName}" is missing Account ID field "${entry.accountIdField}"`
                    )
                }
                if (!headers.includes(entry.accountNameField)) {
                    throw new InternalRecordFormatError(
                        `Internal-record dump "${fileName}" is missing Account Name field "${entry.accountNameField}"`
                    )
                }
                return
            }
            if (fields.length !== headers.length) {
                throw new InternalRecordFormatError(
                    `Internal-record dump "${fileName}" row ${rowNumber} has ${fields.length} fields; expected ${headers.length}`
                )
            }
            const accountId = fields[identityIndex].value
            if (accountId.length === 0) {
                throw new InternalRecordFormatError(
                    `Internal-record dump "${fileName}" row ${rowNumber} has a blank Account ID`
                )
            }
            if (seenIds.has(accountId)) {
                throw new InternalRecordFormatError(
                    `Internal-record dump "${fileName}" row ${rowNumber} has duplicate Account ID "${accountId}"`
                )
            }
            seenIds.add(accountId)
            if (!stream || inShard >= INTERNAL_RECORD_SHARD_SIZE) {
                await closeShard()
                openShard()
            }
            writeFrame(
                pending,
                fields.map((field) => field.raw)
            )
            inShard += 1
            recordCount += 1
            if (pending.reduce((sum, chunk) => sum + chunk.length, 0) > 64 * 1024) {
                await flush()
            }
        })
    } catch (error) {
        const current = stream
        stream = undefined
        if (current) {
            await new Promise<void>((resolve) => {
                current.once('close', () => resolve())
                current.on('error', () => undefined)
                current.destroy()
            })
        }
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

/** Read the packaged Internal Record configuration. Absent file means the package has no Internal Record sources. */
export function loadPackagedInternalRecordConfiguration(directory: string): InternalRecordConfiguration | undefined {
    const filePath = path.join(directory, INTERNAL_RECORD_CONFIGURATION_FILE)
    if (!fs.existsSync(filePath)) return undefined
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as InternalRecordConfiguration
    if (!parsed || !Array.isArray(parsed.sources)) {
        throw new InternalRecordFormatError(
            `Internal Record configuration in "${directory}" must contain a sources array`
        )
    }
    return parsed
}

export function findInternalRecordSource(
    manifest: InternalRecordManifest,
    fileName: string
): InternalRecordSourceManifest | undefined {
    return manifest.sources.find((source) => source.fileName === fileName)
}

/**
 * Decode one shard sequentially. The generator retains only the frame currently being parsed.
 * Frames contain raw CSV cells.
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
): AsyncGenerator<{ headers: string[]; values: string[]; rawValues: string[] }> {
    const manifest = loadInternalRecordManifest(directory)
    const source = findInternalRecordSource(manifest, fileName)
    if (!source) {
        throw new InternalRecordFormatError(internalPackageMessage(fileName))
    }
    for (const shard of source.shards) {
        for await (const rawValues of readInternalRecordShard(path.join(directory, shard))) {
            yield {
                headers: source.headers,
                values: rawValues.map((raw) => unescapeCsvField(raw)),
                rawValues,
            }
        }
    }
}

export function internalRecordSourceId(fileName: string): string {
    return `internal-record:${encodeURIComponent(fileName)}`
}

export function internalPackageMessage(fileName: string): string {
    return `Internal record file "${fileName}" is not in the customizer package. Rebuild and upload the Records Customizer with that internal-record dump.`
}

export type InternalRecordAccountParts = {
    nativeIdentity: string
    name: string
    attributes: Record<string, string | string[]>
}

export type InternalRecordAccountBuilder = (values: string[], rawValues: string[]) => InternalRecordAccountParts

/** Distinct values remembered per column so repeated values share one string. Bounded to cap memory. */
const INTERNAL_RECORD_INTERN_LIMIT = 4096

/**
 * Create a builder that turns one streamed record into account parts.
 *
 * The attribute bag is produced by a generated object literal. Filling an object with `bag[header] = value`
 * makes V8 switch it to dictionary mode after a few properties, which costs several times the memory of a
 * fast-property object. A literal keeps every bag on one shared hidden class, which matters for a dump with
 * hundreds of thousands of records. Repeated values in a column share one string.
 *
 * @param entry - Saved Internal Record configuration for the dump
 * @param headers - Column names in manifest order
 * @param keep - When set, only columns named in this set become attributes
 * @returns Builder to call once per record
 */
export function createInternalRecordAccountBuilder(
    entry: InternalRecordConfigurationEntry,
    headers: string[],
    keep?: ReadonlySet<string>
): InternalRecordAccountBuilder {
    const multiValued = new Set(entry.schema.filter((field) => field.multiValued).map((field) => field.name))
    const idIndex = headers.indexOf(entry.accountIdField)
    const nameIndex = headers.indexOf(entry.accountNameField)
    const columns: number[] = []
    headers.forEach((header, index) => {
        if (!keep || keep.has(header)) columns.push(index)
    })
    const names = columns.map((index) => headers[index])
    const generated = names.every((name) => name !== '__proto__')
    const literal = generated
        ? (new Function(
              'cells',
              `return {${names.map((name, position) => `${JSON.stringify(name)}: cells[${position}]`).join(',')}}`
          ) as (cells: Array<string | string[]>) => Record<string, string | string[]>)
        : undefined
    const interned = columns.map(() => new Map<string, string>())

    return (values, rawValues) => {
        const cells: Array<string | string[]> = new Array(columns.length)
        for (let position = 0; position < columns.length; position++) {
            const index = columns[position]
            const parsed = values[index] ?? ''
            if (multiValued.has(headers[index])) {
                cells[position] = splitUnquotedSemicolons(rawValues[index] ?? parsed)
                continue
            }
            const known = interned[position]
            const shared = known.get(parsed)
            if (shared !== undefined) {
                cells[position] = shared
            } else {
                if (known.size < INTERNAL_RECORD_INTERN_LIMIT) known.set(parsed, parsed)
                cells[position] = parsed
            }
        }
        let attributes: Record<string, string | string[]>
        if (literal) {
            attributes = literal(cells)
        } else {
            attributes = {}
            names.forEach((name, position) => {
                Object.defineProperty(attributes, name, {
                    value: cells[position],
                    enumerable: true,
                    writable: true,
                    configurable: true,
                })
            })
        }
        const nativeIdentity = values[idIndex] ?? ''
        const accountName = values[nameIndex] ?? ''
        return {
            nativeIdentity,
            name: accountName.length > 0 ? accountName : nativeIdentity,
            attributes,
        }
    }
}

/** Build account attributes from one streamed account using the saved Internal Record schema. */
export function internalRecordAttributes(
    entry: InternalRecordConfigurationEntry,
    headers: string[],
    values: string[],
    rawValues: string[]
): InternalRecordAccountParts {
    return createInternalRecordAccountBuilder(entry, headers)(values, rawValues)
}
