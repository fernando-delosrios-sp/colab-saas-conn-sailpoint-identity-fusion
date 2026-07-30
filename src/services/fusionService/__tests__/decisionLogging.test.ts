import { SourceType } from '../../../model/config'
import { FusionDecision } from '../../../model/form'
import {
    formatDecisionCountsSegment,
    formatFusionDecisionLog,
    logFusionDecisionApplied,
    logFusionDecisionDiscovered,
    resolveDecisionEventType,
    summarizeDecisionCounts,
} from '../decisionLogging'

describe('decisionLogging', () => {
    const mergeDecision: FusionDecision = {
        submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Chris Redfield' },
        account: {
            id: 'src-a::acct-1',
            name: 'Sergei Vladimir',
            sourceName: 'Umbrella Corporation',
        },
        newIdentity: false,
        identityId: 'identity-1',
        identityName: 'Albert Wesker',
        comments: 'Merge into existing identity',
        finished: true,
        sourceType: SourceType.Authoritative,
    }

    const newIdentityDecision: FusionDecision = {
        ...mergeDecision,
        newIdentity: true,
        identityId: undefined,
        identityName: undefined,
        comments: 'Create new identity',
    }

    it('classifies decision event types', () => {
        expect(resolveDecisionEventType(mergeDecision)).toBe('merge')
        expect(resolveDecisionEventType(newIdentityDecision)).toBe('newIdentity')
        expect(
            resolveDecisionEventType({
                ...newIdentityDecision,
                sourceType: SourceType.Record,
            })
        ).toBe('noMatch')
        expect(
            resolveDecisionEventType({
                ...mergeDecision,
                automaticMerge: true,
            })
        ).toBe('autoMerge')
    })

    it('formats discovered and applied decision log lines', () => {
        expect(formatFusionDecisionLog(mergeDecision, { phase: 'discovered' })).toBe(
            'MERGE DECISION DISCOVERED: Sergei Vladimir [Umbrella Corporation] → Albert Wesker by Chris Redfield'
        )
        expect(formatFusionDecisionLog(newIdentityDecision, { phase: 'applied', outcome: 'registered' })).toBe(
            'NEW IDENTITY DECISION APPLIED: Sergei Vladimir [Umbrella Corporation] by Chris Redfield → registered as fusion account'
        )
    })

    it('summarizes and formats decision count segments', () => {
        const counts = summarizeDecisionCounts([mergeDecision, newIdentityDecision])
        expect(counts).toEqual({ newIdentity: 1, merge: 1, noMatch: 0, autoMerge: 0 })
        expect(formatDecisionCountsSegment(counts, true)).toBe('decisions(1n/1m/0nm/0a total=2)')
    })

    it('records metrics when a decision is applied', () => {
        const log = {
            recordEvent: vi.fn(),
            getLogLevel: vi.fn().mockReturnValue('info'),
            debug: vi.fn(),
            info: vi.fn(),
        }

        logFusionDecisionApplied(log, mergeDecision, 'merged')
        expect(log.recordEvent).toHaveBeenCalledWith('decision', { type: 'merge' })
        expect(log.info).toHaveBeenCalledWith(
            'MERGE DECISION APPLIED: Sergei Vladimir [Umbrella Corporation] → Albert Wesker by Chris Redfield → merged into target identity'
        )
    })

    it('logs discovered decisions at info without recording metrics', () => {
        const log = {
            recordEvent: vi.fn(),
            getLogLevel: vi.fn().mockReturnValue('info'),
            debug: vi.fn(),
            info: vi.fn(),
        }

        logFusionDecisionDiscovered(log, newIdentityDecision)
        expect(log.recordEvent).not.toHaveBeenCalled()
        expect(log.info).toHaveBeenCalledWith(
            'NEW IDENTITY DECISION DISCOVERED: Sergei Vladimir [Umbrella Corporation] by Chris Redfield'
        )
    })
})
