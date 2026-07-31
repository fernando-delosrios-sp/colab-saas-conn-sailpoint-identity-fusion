import { resolveRecordingConfig } from '../resolveRecordingConfig'

describe('resolveRecordingConfig', () => {
    const envBackup = { ...process.env }
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        warnSpy.mockRestore()
        process.env = { ...envBackup }
    })

    it('defaults to off when no config and no env vars', () => {
        delete process.env.RECORD_MODE
        delete process.env.RECORD_SCENARIO_NAME
        delete process.env.RECORD_CHAIN_NAME
        delete process.env.VERBOSE_RECORDING

        expect(resolveRecordingConfig()).toEqual({ mode: 'off', store: 'ndjson' })
    })

    it('falls back to record mode from RECORD_MODE env var with deprecation warning', () => {
        process.env.RECORD_MODE = 'true'

        expect(resolveRecordingConfig()).toEqual({ mode: 'record', store: 'ndjson' })
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RECORD_MODE is deprecated'))
    })

    it('falls back to replay mode from REPLAY_MODE env var', () => {
        process.env.REPLAY_MODE = 'true'
        process.env.RECORD_SCENARIO_NAME = 'my-scenario'

        expect(resolveRecordingConfig()).toEqual({
            mode: 'replay',
            scenarioName: 'my-scenario',
            chainName: 'my-scenario',
            store: 'ndjson',
        })
    })

    it('RECORD_MODE takes precedence over REPLAY_MODE when both env vars are set', () => {
        process.env.RECORD_MODE = 'true'
        process.env.REPLAY_MODE = 'true'

        expect(resolveRecordingConfig().mode).toBe('record')
    })

    it('falls back scenarioName and verbose from env vars', () => {
        process.env.RECORD_MODE = 'true'
        process.env.RECORD_SCENARIO_NAME = 'my-scenario'
        process.env.VERBOSE_RECORDING = 'true'

        expect(resolveRecordingConfig()).toEqual({
            mode: 'record',
            scenarioName: 'my-scenario',
            chainName: 'my-scenario',
            verbose: true,
            store: 'ndjson',
        })
    })

    it('falls back scenarioName from deprecated RECORD_CHAIN_NAME with warning', () => {
        process.env.RECORD_CHAIN_NAME = 'legacy-chain'

        expect(resolveRecordingConfig()).toEqual({
            mode: 'off',
            scenarioName: 'legacy-chain',
            chainName: 'legacy-chain',
            store: 'ndjson',
        })
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RECORD_CHAIN_NAME is deprecated'))
    })

    it('prefers RECORD_SCENARIO_NAME over deprecated RECORD_CHAIN_NAME', () => {
        process.env.RECORD_SCENARIO_NAME = 'new-scenario'
        process.env.RECORD_CHAIN_NAME = 'legacy-chain'

        expect(resolveRecordingConfig()).toEqual({
            mode: 'off',
            scenarioName: 'new-scenario',
            chainName: 'new-scenario',
            store: 'ndjson',
        })
        expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('RECORD_CHAIN_NAME is deprecated'))
    })

    it('explicit config mode overrides RECORD_MODE env var', () => {
        process.env.RECORD_MODE = 'true'

        expect(resolveRecordingConfig({ mode: 'off' })).toEqual({ mode: 'off', store: 'ndjson' })
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('explicit scenarioName and verbose override env vars', () => {
        process.env.RECORD_CHAIN_NAME = 'env-chain'
        process.env.VERBOSE_RECORDING = 'true'

        expect(
            resolveRecordingConfig({ mode: 'record', scenarioName: 'cfg-scenario', verbose: false })
        ).toEqual({
            mode: 'record',
            scenarioName: 'cfg-scenario',
            chainName: 'cfg-scenario',
            verbose: false,
            store: 'ndjson',
        })
    })

    it('reads deprecated chainName with warning when scenarioName is unset', () => {
        expect(resolveRecordingConfig({ mode: 'record', chainName: 'legacy-chain' })).toEqual({
            mode: 'record',
            scenarioName: 'legacy-chain',
            chainName: 'legacy-chain',
            store: 'ndjson',
        })
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('recording.chainName is deprecated'))
    })

    it('prefers explicit scenarioName over deprecated chainName', () => {
        expect(
            resolveRecordingConfig({ mode: 'record', scenarioName: 'new-scenario', chainName: 'legacy-chain' })
        ).toEqual({
            mode: 'record',
            scenarioName: 'new-scenario',
            chainName: 'new-scenario',
            store: 'ndjson',
        })
        expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('recording.chainName is deprecated'))
    })

    it('preserves explicit store type', () => {
        expect(resolveRecordingConfig({ mode: 'record', store: 'sqlite' })).toEqual({
            mode: 'record',
            store: 'sqlite',
        })
    })
})
