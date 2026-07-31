import type { RecordingConfig } from '../../model/config'

/**
 * Resolves recording configuration with env var fallbacks for dev/CI tooling.
 * Explicit config values take precedence over `RECORD_MODE`, `REPLAY_MODE`, `RECORD_SCENARIO_NAME`, and `VERBOSE_RECORDING`.
 */
export function resolveRecordingConfig(raw?: Partial<RecordingConfig>): RecordingConfig {
    let mode: RecordingConfig['mode'] = 'off'
    if (raw?.mode !== undefined) {
        mode = raw.mode
    } else if (process.env.RECORD_MODE === 'true') {
        console.warn(
            '[recording] RECORD_MODE is deprecated; set recording.mode via External Settings or platform config.'
        )
        mode = 'record'
    } else if (process.env.REPLAY_MODE === 'true') {
        mode = 'replay'
    }

    let scenarioName: string | undefined
    if (raw?.scenarioName !== undefined && raw.scenarioName !== '') {
        scenarioName = raw.scenarioName
    } else if (raw?.chainName !== undefined && raw.chainName !== '') {
        console.warn('[recording] recording.chainName is deprecated; use recording.scenarioName.')
        scenarioName = raw.chainName
    } else if (process.env.RECORD_SCENARIO_NAME !== undefined && process.env.RECORD_SCENARIO_NAME !== '') {
        scenarioName = process.env.RECORD_SCENARIO_NAME
    } else if (process.env.RECORD_CHAIN_NAME !== undefined && process.env.RECORD_CHAIN_NAME !== '') {
        console.warn('[recording] RECORD_CHAIN_NAME is deprecated; use RECORD_SCENARIO_NAME.')
        scenarioName = process.env.RECORD_CHAIN_NAME
    }

    const verbose =
        raw?.verbose !== undefined ? raw.verbose : process.env.VERBOSE_RECORDING === 'true' ? true : undefined
    const store = raw?.store ?? 'ndjson'

    return {
        mode,
        ...(scenarioName !== undefined ? { scenarioName, chainName: scenarioName } : {}),
        ...(verbose !== undefined ? { verbose } : {}),
        store,
    }
}
