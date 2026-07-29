import type { RecordingConfig } from '../../model/config'

/**
 * Resolves recording configuration with env var fallbacks for dev/CI tooling.
 * Explicit config values take precedence over `RECORD_MODE`, `REPLAY_MODE`, `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING`.
 */
export function resolveRecordingConfig(raw?: Partial<RecordingConfig>): RecordingConfig {
    let mode: RecordingConfig['mode'] = 'off'
    if (raw?.mode !== undefined) {
        mode = raw.mode
    } else if (process.env.RECORD_MODE === 'true') {
        mode = 'record'
    } else if (process.env.REPLAY_MODE === 'true') {
        mode = 'replay'
    }

    const chainName = raw?.chainName ?? process.env.RECORD_CHAIN_NAME
    const verbose =
        raw?.verbose !== undefined ? raw.verbose : process.env.VERBOSE_RECORDING === 'true' ? true : undefined
    const store = raw?.store ?? 'ndjson'

    return {
        mode,
        ...(chainName !== undefined && chainName !== '' ? { chainName } : {}),
        ...(verbose !== undefined ? { verbose } : {}),
        store,
    }
}

