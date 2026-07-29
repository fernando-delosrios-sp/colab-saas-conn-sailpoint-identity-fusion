import * as fs from 'fs'
import * as path from 'path'
import type { ApiLogEntry } from '../clientService/recordingApiAdapter'
import type { RecordingManifest, RecordingStore } from './recordingStore'

const COLLECTION_FILES = {
    steps: 'steps.ndjson',
    phases: 'phases.ndjson',
} as const

/** Default NDJSON append-only store for record-mode artifacts. */
export class NdjsonRecordingStore implements RecordingStore {
    private readonly recordingDir: string
    private readonly apiLogPath: string
    private apiLogEntryCount = 0
    private phaseCount = 0

    constructor(private readonly chainName: string) {
        this.recordingDir = path.resolve('test-data', 'recordings', chainName)
        this.apiLogPath = path.join(this.recordingDir, 'api-log.ndjson')
        this.apiLogEntryCount = this.countLines(this.apiLogPath)
        this.phaseCount = this.countLines(path.join(this.recordingDir, COLLECTION_FILES.phases))
    }

    appendApiCall(entry: ApiLogEntry): void {
        fs.mkdirSync(this.recordingDir, { recursive: true })
        fs.appendFileSync(
            this.apiLogPath,
            JSON.stringify({
                api: entry.api,
                method: entry.method,
                args: entry.args,
                response: entry.response,
                timestamp: entry.timestamp,
            }) + '\n'
        )
        this.apiLogEntryCount++
    }

    append(collection: 'steps' | 'phases', record: unknown): void {
        fs.mkdirSync(this.recordingDir, { recursive: true })
        const filePath = path.join(this.recordingDir, COLLECTION_FILES[collection])
        fs.appendFileSync(filePath, JSON.stringify(record) + '\n')
        if (collection === 'phases') {
            this.phaseCount++
        }
    }

    loadApiLog(): ApiLogEntry[] {
        if (!fs.existsSync(this.apiLogPath)) return []
        const content = fs.readFileSync(this.apiLogPath, 'utf-8').trim()
        if (!content) return []
        return content.split('\n').map((line) => JSON.parse(line) as ApiLogEntry)
    }

    writeManifest(manifest: RecordingManifest): void {
        fs.mkdirSync(this.recordingDir, { recursive: true })
        fs.writeFileSync(path.join(this.recordingDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    }

    getRecordingDir(): string {
        return this.recordingDir
    }

    getApiLogPath(): string {
        return this.apiLogPath
    }

    getApiLogEntryCount(): number {
        return this.apiLogEntryCount
    }

    getPhaseCount(): number {
        return this.phaseCount
    }

    close(): void {
        /* NDJSON store has no handles to release */
    }

    private countLines(filePath: string): number {
        if (!fs.existsSync(filePath)) return 0
        const content = fs.readFileSync(filePath, 'utf-8').trim()
        if (!content) return 0
        return content.split('\n').filter(Boolean).length
    }
}
