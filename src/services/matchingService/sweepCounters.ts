import { LogService } from '../logService'
import type { MatchResolution, MatchSweepResult } from './matchOutcomeDispatcher'

export function resolutionCountKey(resolution: MatchResolution): 'exact' | 'partial' | 'deferred' | 'nonMatch' {
    switch (resolution) {
        case 'exact-match':
            return 'exact'
        case 'partial-match':
            return 'partial'
        case 'deferred-match':
            return 'deferred'
        case 'non-match':
            return 'nonMatch'
    }
}

export function recordNonMatchOutcome(log: LogService, sweepResult?: MatchSweepResult): void {
    if (sweepResult) sweepResult.nonMatch++
    log.recordEvent('nonMatch')
}

export function applyResolutionToSweepResult(
    log: LogService,
    result: MatchSweepResult,
    resolution: MatchResolution
): void {
    const countKey = resolutionCountKey(resolution)
    if (countKey === 'nonMatch') {
        recordNonMatchOutcome(log, result)
    } else {
        result[countKey]++
    }
}

export function toPublicMatchResolution(
    resolution: 'identity-match' | 'deferred-match' | 'non-match'
): MatchResolution {
    return resolution === 'identity-match' ? 'partial-match' : resolution
}
