import { FusionRun } from '../../../model/fusionRun'
import { FusionAccount } from '../../../model/account'
import {
    sourceHasReviewers,
    sourceManualReviewPathAvailable,
    sourceShouldEnterMatchScoring,
} from '../reviewerAvailability'
import type { SourceInfo } from '../../sourceService'
import { SourceType } from '../../../model/config'

describe('reviewerAvailability', () => {
    const SOURCE_ID = 'source-a-id'

    beforeEach(() => {
        FusionAccount.configure({ sources: [], fusionFormAttributes: [] } as any)
    })

    function sourceInfo(): SourceInfo {
        return {
            id: SOURCE_ID,
            name: 'Source A',
            isManaged: true,
            sourceType: SourceType.Authoritative,
            config: {},
        }
    }

    function config(overrides: Partial<{ fusionEnableAutoMerge: boolean; fusionEnableManualReview: boolean }> = {}) {
        return {
            fusionEnableAutoMerge: false,
            fusionEnableManualReview: true,
            ...overrides,
        }
    }

    describe('sourceHasReviewers', () => {
        it('returns false when sourceInfo is undefined', () => {
            const run = new FusionRun()
            expect(sourceHasReviewers(undefined, run)).toBe(false)
        })

        it('returns false when reviewers set is empty', () => {
            const run = new FusionRun()
            run.reviewersBySourceId.set(SOURCE_ID, new Set())
            expect(sourceHasReviewers(sourceInfo(), run)).toBe(false)
        })

        it('returns true when at least one reviewer is configured', () => {
            const run = new FusionRun()
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            expect(sourceHasReviewers(sourceInfo(), run)).toBe(true)
        })
    })

    describe('sourceShouldEnterMatchScoring', () => {
        it('returns true when automatic merge is enabled', () => {
            const run = new FusionRun()
            expect(sourceShouldEnterMatchScoring(config({ fusionEnableAutoMerge: true }), sourceInfo(), run)).toBe(true)
        })

        it('returns true when manual review is enabled and reviewers exist', () => {
            const run = new FusionRun()
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            expect(sourceShouldEnterMatchScoring(config(), sourceInfo(), run)).toBe(true)
        })

        it('returns false when manual review is enabled but no reviewers exist and automatic merge is off', () => {
            const run = new FusionRun()
            expect(
                sourceShouldEnterMatchScoring(
                    config({ fusionEnableAutoMerge: false, fusionEnableManualReview: true }),
                    sourceInfo(),
                    run
                )
            ).toBe(false)
        })

        it('returns false when both automatic merge and manual review are disabled', () => {
            const run = new FusionRun()
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            expect(
                sourceShouldEnterMatchScoring(
                    config({ fusionEnableAutoMerge: false, fusionEnableManualReview: false }),
                    sourceInfo(),
                    run
                )
            ).toBe(false)
        })
    })

    describe('sourceManualReviewPathAvailable', () => {
        it('returns false when manual review is explicitly disabled', () => {
            const run = new FusionRun()
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            expect(
                sourceManualReviewPathAvailable({ fusionEnableManualReview: false }, sourceInfo(), run)
            ).toBe(false)
        })

        it('returns false when manual review is enabled but no reviewers exist', () => {
            const run = new FusionRun()
            expect(sourceManualReviewPathAvailable({ fusionEnableManualReview: true }, sourceInfo(), run)).toBe(false)
        })

        it('returns true when manual review is enabled and reviewers exist', () => {
            const run = new FusionRun()
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            expect(sourceManualReviewPathAvailable({ fusionEnableManualReview: true }, sourceInfo(), run)).toBe(true)
        })
    })
})
