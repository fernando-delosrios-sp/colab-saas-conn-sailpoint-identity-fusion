import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import { anchorDeferredMatchesForReview } from '../matchingHelpers'
import { MatchCandidateType } from '../types'

describe('anchorDeferredMatchesForReview', () => {
    beforeAll(() => {
        FusionAccount.configure({ sources: [] } as FusionConfig)
    })

    it('caps persisted anchor deferred matches to fusionMaxCandidatesForForm', () => {
        const run = new FusionRun()
        const fusionAccount = FusionAccount.fromManagedAccount({
            id: 'acct-1',
            nativeIdentity: 'nat-1',
            name: 'Candidate',
            sourceId: 'src-1',
            sourceName: 'Source A',
            attributes: {},
        } as any)

        const anchors = ['a', 'b', 'c', 'd'].map((id, index) => {
            const anchor = FusionAccount.fromManagedAccount({
                id: `anchor-${id}`,
                nativeIdentity: id,
                name: `Anchor ${index}`,
                sourceId: 'src-1',
                sourceName: 'Source A',
                attributes: {},
            } as any)
            run.registerPersistedDeferredCandidate(anchor)
            return anchor
        })

        for (const [index, anchor] of anchors.entries()) {
            fusionAccount.layers.addFusionMatch({
                fusionIdentity: anchor,
                identityName: anchor.name,
                candidateType: MatchCandidateType.Deferred,
                scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 100 - index, isMatch: true }],
            })
        }

        const capped = anchorDeferredMatchesForReview(fusionAccount, run, 3)
        expect(capped).toHaveLength(3)
        expect(capped[0].fusionIdentity?.name).toBe('Anchor 0')
    })
})
