import * as fs from 'fs'
import { ApiLogEntry } from '../../clientService/recordingApiAdapter'
import { clearRecordingStoreCache, getOrCreateRecordingStore } from '../recordingStore'

describe('tenant-scoped recording store isolation', () => {
    afterEach(() => {
        clearRecordingStoreCache()
    })

    it('persists same chain name under separate tenant directories without collision', async () => {
        const chainName = `collision-${Date.now()}`
        const config = { mode: 'record' as const, store: 'ndjson' as const }
        const acmeEntry: ApiLogEntry = {
            api: 'accounts',
            getter: 'accounts',
            method: 'listAccounts',
            args: [{ limit: 1 }],
            response: { tenant: 'acme' },
            timestamp: '2026-01-01T00:00:00.000Z',
        }
        const globexEntry: ApiLogEntry = {
            api: 'accounts',
            getter: 'accounts',
            method: 'listAccounts',
            args: [{ limit: 1 }],
            response: { tenant: 'globex' },
            timestamp: '2026-01-01T00:00:01.000Z',
        }

        const storeA = getOrCreateRecordingStore(config, chainName, 'https://acme.api.identitynow.com')
        const storeB = getOrCreateRecordingStore(config, chainName, 'https://globex.api.identitynow.com')

        storeA.appendApiCall(acmeEntry)
        storeB.appendApiCall(globexEntry)
        await storeA.flush()
        await storeB.flush()

        const dirA = storeA.getRecordingDir()
        const dirB = storeB.getRecordingDir()
        expect(dirA).not.toBe(dirB)
        expect(dirA).toMatch(/recordings[/\\]acme[/\\]/)
        expect(dirB).toMatch(/recordings[/\\]globex[/\\]/)

        expect(storeA.loadApiLog()).toEqual([acmeEntry])
        expect(storeB.loadApiLog()).toEqual([globexEntry])

        fs.rmSync(dirA, { recursive: true, force: true })
        fs.rmSync(dirB, { recursive: true, force: true })
    })
})

