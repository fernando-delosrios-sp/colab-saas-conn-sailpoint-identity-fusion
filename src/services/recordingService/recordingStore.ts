import * as fs from 'fs'
import * as path from 'path'
import type { RecordingConfig } from '../../model/config'
import type { ApiLogEntry } from '../clientService/recordingApiAdapter'
import { NdjsonRecordingStore } from './ndjsonRecordingStore'

/** Metadata written to manifest.json on finalize. */
export interface RecordingManifest {
    version: string
    store: RecordingConfig['store']
    chainName: string
    recordedAt: string
    apiLogPath: string
    apiLogEntryCount: number
    stepsPath: string
    stepCount: number
    phasesPath?: string
    phaseCount: number
    scenarioPath: string
    reportsPath?: string
    matchingResultsPath?: string
    artifactPaths: string[]
}

/** Read-only api-log access for replay adapters. */
interface ApiLogReader {
    loadApiLog(): ApiLogEntry[]
}

/** Pluggable persistence for record-mode artifacts. */
export interface RecordingStore extends ApiLogReader {
    appendApiCall(entry: ApiLogEntry): void
    append(collection: 'steps' | 'phases', record: unknown): void
    writeManifest(manifest: RecordingManifest): void
    getRecordingDir(): string
    getApiLogPath(): string
    getApiLogEntryCount(): number
    getPhaseCount(): number
    flush(): Promise<void>
    close(): void
}

const storeCache = new Map<string, RecordingStore>()

/** Creates the configured store implementation (default NDJSON). */
export function createRecordingStore(config: RecordingConfig, chainName: string): RecordingStore {
    const storeType = config.store ?? 'ndjson'
    switch (storeType) {
        case 'ndjson':
            return new NdjsonRecordingStore(chainName)
        default:
            throw new Error(`Unsupported recording store: ${storeType}`)
    }
}

/** Returns one store instance per chain so api-log and counters stay consistent across operations. */
export function getOrCreateRecordingStore(config: RecordingConfig, chainName: string): RecordingStore {
    const cached = storeCache.get(chainName)
    if (cached) return cached
    const store = createRecordingStore(config, chainName)
    storeCache.set(chainName, store)
    return store
}

/** Clears cached stores (for tests). */
export function clearRecordingStoreCache(): void {
    storeCache.clear()
}

/** Loads api-log entries from a chain directory using manifest store type when present. */
export function loadRecordingApiLog(chainDir: string): ApiLogEntry[] {
    const manifestPath = path.join(chainDir, 'manifest.json')
    let storeType: RecordingConfig['store'] = 'ndjson'

    if (fs.existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as RecordingManifest
            storeType = manifest.store ?? 'ndjson'
            if (manifest.apiLogPath) {
                const apiLogPath = path.isAbsolute(manifest.apiLogPath)
                    ? manifest.apiLogPath
                    : path.join(process.cwd(), manifest.apiLogPath)
                if (fs.existsSync(apiLogPath)) {
                    const content = fs.readFileSync(apiLogPath, 'utf-8').trim()
                    if (!content) return []
                    return content.split('\n').map((line) => JSON.parse(line) as ApiLogEntry)
                }
            }
        } catch {
            /* fall back to ndjson default */
        }
    }

    const chainName = path.basename(chainDir)
    const store = createRecordingStore({ mode: 'replay', store: storeType, chainName }, chainName)
    return store.loadApiLog()
}


