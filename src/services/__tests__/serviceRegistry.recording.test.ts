import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { readConfig } from '@sailpoint/connector-sdk'
import { safeReadConfig } from '../../data/config/readConfig'
import { ServiceRegistry } from '../serviceRegistry'
import { RecordingApiAdapter } from '../clientService/recordingApiAdapter'
import { ReplayApiAdapter } from '../clientService/replayApiAdapter'
import { SdkApiAdapter } from '../clientService'
import { ApiLogEntry } from '../clientService/recordingApiAdapter'
import { loadRecordingApiLog } from '../recordingService/recordingStore'
import { resetRecordingLifecycleForTests } from '../recordingService'
import { OperationRunContext } from '../logService/operationRunContext'
import { recordingChainDir } from '../../data/recordingPaths'
import { FIXTURE_BASEURL } from '../../operations/__tests__/scenario/fixtures/minimalRecordingFixture'
import { FusionConfig } from '../../model/config'

vi.mock('@sailpoint/connector-sdk', async () => {
    const actual = await vi.importActual<typeof import('@sailpoint/connector-sdk')>('@sailpoint/connector-sdk')
    return {
        ...actual,
        readConfig: vi.fn(),
    }
})

const minimalPlatformConfig = {
    baseurl: FIXTURE_BASEURL,
    clientId: 'id',
    clientSecret: 'secret',
    spConnectorInstanceId: 'instance-id',
    sources: [],
}

function installTenantScopedReplayChain(chainName: string, baseurl: string, entry: ApiLogEntry): string {
    const dir = recordingChainDir(chainName, baseurl)
    fs.mkdirSync(dir, { recursive: true })
    const apiLogPath = path.join(dir, 'api-log.ndjson')
    fs.writeFileSync(apiLogPath, JSON.stringify(entry) + '\n')
    fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
            version: '1.0.0',
            store: 'ndjson',
            chainName,
            recordedAt: new Date().toISOString(),
            apiLogPath: path.relative(process.cwd(), apiLogPath),
            apiLogEntryCount: 1,
            stepsPath: 'steps.ndjson',
            stepCount: 0,
            phaseCount: 0,
            scenarioPath: 'scenario.json',
            artifactPaths: [],
        })
    )
    return dir
}

describe('ServiceRegistry recording wiring', () => {
    const envBackup = { ...process.env }

    beforeEach(() => {
        vi.mocked(readConfig).mockResolvedValue(minimalPlatformConfig as never)
    })

    afterEach(() => {
        process.env = { ...envBackup }
        resetRecordingLifecycleForTests()
    })

    it('wires RecordingApiAdapter when RECORD_MODE env resolves via safeReadConfig', async () => {
        process.env.RECORD_MODE = 'true'
        process.env.RECORD_CHAIN_NAME = 'env-only-chain'

        const config = await safeReadConfig()
        expect(config.recording?.mode).toBe('record')
        expect(config.recording?.chainName).toBe('env-only-chain')

        const registry = new ServiceRegistry(config, {}, { send: vi.fn() }, 'testConnection')

        expect(registry.recording).toBeDefined()
        expect(registry.recording?.getName()).toBe('env-only-chain')
        expect(registry.client).toBeDefined()

        const innerAdapter = (registry.client as any).adapter
        expect(innerAdapter).toBeInstanceOf(RecordingApiAdapter)
        expect((innerAdapter as any).inner).toBeInstanceOf(SdkApiAdapter)
    })

    it('phaseEnd hook appends to phases.ndjson when recording is active', async () => {
        process.env.RECORD_MODE = 'true'
        process.env.RECORD_CHAIN_NAME = `phase-hook-${Date.now()}`

        const config = await safeReadConfig()
        const registry = new ServiceRegistry(config, {}, { send: vi.fn() }, 'accountList')

        registry.log.bindRunContext(new OperationRunContext())
        registry.log.phaseStart(1, 'Setup')
        registry.log.phaseEnd(1, 'Setup', { sources: 2 })

        await registry.recording!.getStore().flush()

        const phasesPath = path.join(registry.recording!.getRecordingDir(), 'phases.ndjson')
        expect(fs.existsSync(phasesPath)).toBe(true)
        const record = JSON.parse(fs.readFileSync(phasesPath, 'utf-8').trim())
        expect(record.phase).toBe('Setup')
        expect(record.phaseNumber).toBe(1)

        fs.rmSync(registry.recording!.getRecordingDir(), { recursive: true, force: true })
    })

    it('wires ReplayApiAdapter from tenant-scoped chain directory', async () => {
        const chainName = `replay-registry-${Date.now()}`
        const apiEntry: ApiLogEntry = {
            api: 'sources',
            method: 'listSources',
            args: [{}],
            response: [{ id: 'tenant-scoped-src' }],
            timestamp: '2026-01-01T00:00:00.000Z',
        }
        const chainDir = installTenantScopedReplayChain(chainName, FIXTURE_BASEURL, apiEntry)

        const config = {
            ...minimalPlatformConfig,
            recording: { mode: 'replay' as const, chainName, store: 'ndjson' as const },
        } as FusionConfig

        const registry = new ServiceRegistry(config, {}, { send: vi.fn() }, 'testConnection')

        expect(registry.recording).toBeUndefined()
        const adapter = (registry.client as any).adapter
        expect(adapter).toBeInstanceOf(ReplayApiAdapter)

        const result = await registry.client.sourcesApi.listSources({})
        expect(result).toEqual([{ id: 'tenant-scoped-src' }])

        fs.rmSync(chainDir, { recursive: true, force: true })
    })

    it('replay mode never wires live SdkApiAdapter as the active adapter', async () => {
        const scenarioName = `replay-guard-${Date.now()}`
        const apiEntry: ApiLogEntry = {
            api: 'sources',
            method: 'listSources',
            args: [{}],
            response: [{ id: 'guard-src' }],
            timestamp: '2026-01-01T00:00:00.000Z',
        }
        const scenarioDir = installTenantScopedReplayChain(scenarioName, FIXTURE_BASEURL, apiEntry)

        const config = {
            ...minimalPlatformConfig,
            recording: { mode: 'replay' as const, scenarioName, store: 'ndjson' as const },
        } as FusionConfig

        const registry = new ServiceRegistry(config, {}, { send: vi.fn() }, 'testConnection')

        const adapter = (registry.client as any).adapter
        expect(adapter).toBeInstanceOf(ReplayApiAdapter)
        expect(adapter).not.toBeInstanceOf(SdkApiAdapter)

        fs.rmSync(scenarioDir, { recursive: true, force: true })
    })

    it('wires RecordingApiAdapter when forwarded proxy config has client-resolved recording.mode off', async () => {
        delete process.env.PROXY_PASSWORD
        process.env.PROXY_PASSWORD = 'secret'

        const config = {
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
            externalTargetUrl: 'https://proxy.example.com',
            externalTargetPassword: 'secret',
            isProxy: true,
            recording: { mode: 'off' as const, store: 'ndjson' as const },
        } as FusionConfig

        // Simulate proxy server re-reading forwarded config via bridgeExternalRecording path
        config.recording = { mode: 'record', chainName: 'prod-baseline', store: 'ndjson' }

        const registry = new ServiceRegistry(config, {}, { send: vi.fn() }, 'accountList')

        expect(registry.recording).toBeDefined()
        expect(registry.recording?.getName()).toBe('prod-baseline')
        const adapter = (registry.client as any).adapter
        expect(adapter).toBeInstanceOf(RecordingApiAdapter)
    })

    it('skips RecordingService wiring on ISC proxy client config', async () => {
        delete process.env.PROXY_PASSWORD
        delete process.env.RECORD_MODE
        delete process.env.RECORD_CHAIN_NAME

        const config = {
            ...minimalPlatformConfig,
            externalProcessingEnabled: true,
            externalProxyEnabled: true,
            externalRecordingEnabled: true,
            recordingName: 'prod-baseline',
            externalTargetUrl: 'https://proxy.example.com',
            recording: { mode: 'record' as const, chainName: 'prod-baseline', store: 'ndjson' as const },
        } as FusionConfig

        const registry = new ServiceRegistry(config, {}, { send: vi.fn() }, 'accountList')

        expect(registry.recording).toBeUndefined()
        const adapter = (registry.client as any).adapter
        expect(adapter).toBeInstanceOf(SdkApiAdapter)
        expect(adapter).not.toBeInstanceOf(RecordingApiAdapter)
    })
})

describe('loadRecordingApiLog', () => {
    it('loads api-log via manifest apiLogPath', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-load-'))
        const apiLogPath = path.join(tmpDir, 'api-log.ndjson')
        const entry = {
            api: 'accounts',
            method: 'listAccounts',
            args: [{ limit: 5 }],
            response: { data: [] },
            timestamp: '2026-01-01T00:00:00.000Z',
        }
        fs.writeFileSync(apiLogPath, JSON.stringify(entry) + '\n')
        fs.writeFileSync(
            path.join(tmpDir, 'manifest.json'),
            JSON.stringify({
                version: '1.0.0',
                store: 'ndjson',
                chainName: 'test',
                recordedAt: new Date().toISOString(),
                apiLogPath: path.relative(process.cwd(), apiLogPath),
                apiLogEntryCount: 1,
                stepsPath: 'steps.ndjson',
                stepCount: 0,
                phaseCount: 0,
                scenarioPath: 'scenario.json',
                artifactPaths: [],
            })
        )

        const loaded = loadRecordingApiLog(tmpDir)
        expect(loaded).toHaveLength(1)
        expect(loaded[0].api).toBe('accounts')

        fs.rmSync(tmpDir, { recursive: true, force: true })
    })
})




