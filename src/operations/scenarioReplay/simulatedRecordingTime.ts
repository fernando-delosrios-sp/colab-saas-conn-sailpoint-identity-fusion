export type StepTimestampLogger = {
    warn: (message: string) => void
}

/**
 * Resolves the recorded timestamp for a replay step.
 * Prefers per-step `steps.ndjson` timestamp, then scenario `recordedAt`.
 * When neither is present, logs a warning and returns undefined (wall clock via `FusionRun.currentTimeMs()`).
 */
export function resolveStepTimestamp(
    stepId: string,
    stepTimestamp: string | undefined,
    recordedAt: string | undefined,
    log?: StepTimestampLogger
): string | undefined {
    if (stepTimestamp) {
        return stepTimestamp
    }
    if (recordedAt) {
        return recordedAt
    }
    log?.warn(`Replay step ${stepId}: no step or scenario timestamp; using wall clock for stale form checks`)
    return undefined
}

/**
 * Applies resolved replay timestamp on a FusionRun when present.
 */
export function applySimulatedRecordingTime(
    run: { setSimulatedTime: (isoOrMs: string | number) => void },
    stepId: string,
    stepTimestamp: string | undefined,
    recordedAt: string | undefined,
    log?: StepTimestampLogger
): void {
    const timestamp = resolveStepTimestamp(stepId, stepTimestamp, recordedAt, log)
    if (timestamp) {
        run.setSimulatedTime(timestamp)
    }
}
