import { describe, it, expect, vi } from 'vitest'
import { resolveStepTimestamp, applySimulatedRecordingTime } from '../index'
import { FusionRun } from '../../../model/fusionRun'

describe('resolveStepTimestamp', () => {
    it('prefers per-step timestamp over scenario recordedAt', () => {
        expect(resolveStepTimestamp('step-1', '2026-07-31T08:00:00.000Z', '2026-07-30T00:00:00.000Z')).toBe(
            '2026-07-31T08:00:00.000Z'
        )
    })

    it('falls back to scenario recordedAt when step timestamp is missing', () => {
        expect(resolveStepTimestamp('step-1', undefined, '2026-07-30T00:00:00.000Z')).toBe('2026-07-30T00:00:00.000Z')
    })

    it('logs a warning and returns undefined when no timestamps exist', () => {
        const warn = vi.fn()
        expect(resolveStepTimestamp('step-9', undefined, undefined, { warn })).toBeUndefined()
        expect(warn).toHaveBeenCalledWith(
            'Replay step step-9: no step or scenario timestamp; using wall clock for stale form checks'
        )
    })
})

describe('applySimulatedRecordingTime', () => {
    it('sets FusionRun simulated time from resolved timestamp', () => {
        const run = new FusionRun()
        applySimulatedRecordingTime(run, 'step-23', '2026-07-31T08:24:12.899Z', undefined)
        expect(run.currentTimeMs()).toBe(Date.parse('2026-07-31T08:24:12.899Z'))
    })
})
