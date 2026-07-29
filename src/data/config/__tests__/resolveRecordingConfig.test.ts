import { resolveRecordingConfig } from '../resolveRecordingConfig'

describe('resolveRecordingConfig', () => {
    const envBackup = { ...process.env }

    afterEach(() => {
        process.env = { ...envBackup }
    })

    it('defaults to off when no config and no env vars', () => {
        delete process.env.RECORD_MODE
        delete process.env.RECORD_CHAIN_NAME
        delete process.env.VERBOSE_RECORDING

        expect(resolveRecordingConfig()).toEqual({ mode: 'off', store: 'ndjson' })
    })

    it('falls back to record mode from RECORD_MODE env var', () => {
        process.env.RECORD_MODE = 'true'

        expect(resolveRecordingConfig()).toEqual({ mode: 'record', store: 'ndjson' })
    })

    it('falls back chainName and verbose from env vars', () => {
        process.env.RECORD_MODE = 'true'
        process.env.RECORD_CHAIN_NAME = 'my-chain'
        process.env.VERBOSE_RECORDING = 'true'

        expect(resolveRecordingConfig()).toEqual({
            mode: 'record',
            chainName: 'my-chain',
            verbose: true,
            store: 'ndjson',
        })
    })

    it('explicit config mode overrides RECORD_MODE env var', () => {
        process.env.RECORD_MODE = 'true'

        expect(resolveRecordingConfig({ mode: 'off' })).toEqual({ mode: 'off', store: 'ndjson' })
    })

    it('explicit chainName and verbose override env vars', () => {
        process.env.RECORD_CHAIN_NAME = 'env-chain'
        process.env.VERBOSE_RECORDING = 'true'

        expect(resolveRecordingConfig({ mode: 'record', chainName: 'cfg-chain', verbose: false })).toEqual({
            mode: 'record',
            chainName: 'cfg-chain',
            verbose: false,
            store: 'ndjson',
        })
    })

    it('preserves explicit store type', () => {
        expect(resolveRecordingConfig({ mode: 'record', store: 'sqlite' })).toEqual({
            mode: 'record',
            store: 'sqlite',
        })
    })
})
