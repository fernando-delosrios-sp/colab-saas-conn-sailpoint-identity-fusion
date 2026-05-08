import {
    buildCandidateList,
    buildFormName,
    calculateExpirationDate,
    countIdentityBackedFusionMatches,
    getFormOwner,
    resolveIdentitiesSelectLabel,
} from '../helpers'
import { MatchCandidateType } from '../../scoringService/types'

describe('formService helpers', () => {
    describe('countIdentityBackedFusionMatches', () => {
        it('counts identity candidates and excludes deferred new-unmatched', () => {
            expect(
                countIdentityBackedFusionMatches([
                    { identityId: 'a', identityName: 'A', scores: [] } as any,
                    {
                        identityId: 'b',
                        identityName: 'B',
                        candidateType: MatchCandidateType.NewUnmatched,
                        scores: [],
                    } as any,
                    { identityId: 'c', identityName: 'C', scores: [] } as any,
                ])
            ).toBe(2)
        })
    })

    describe('resolveIdentitiesSelectLabel', () => {
        it('prefers attributes.displayName from the identity document (matches search index label)', () => {
            const doc = {
                attributes: { displayName: 'brenda.cooper' },
            } as any
            const label = resolveIdentitiesSelectLabel({}, 'id-1', doc)
            expect(label).toBe('brenda.cooper')
        })

        it('uses fusion attributes when identity document is not provided', () => {
            const label = resolveIdentitiesSelectLabel({ displayName: 'Jane' }, 'id-2')
            expect(label).toBe('Jane')
        })

        it('prefers identity document displayName over stale fusion snapshot', () => {
            const doc = { attributes: { displayName: 'From Index' } } as any
            const label = resolveIdentitiesSelectLabel({ displayName: 'Stale' }, 'id-3', doc)
            expect(label).toBe('From Index')
        })

        it('falls back to identity document name when displayName is missing', () => {
            const doc = { name: 'identity.name fallback' } as any
            const label = resolveIdentitiesSelectLabel({}, 'id-4', doc)
            expect(label).toBe('identity.name fallback')
        })

        it('falls back to identity id when displayName is missing everywhere', () => {
            const label = resolveIdentitiesSelectLabel({}, 'fallback-id')
            expect(label).toBe('fallback-id')
        })
    })

    describe('buildFormName', () => {
        it('should build form name from fusion account', () => {
            const fusionAccount = {
                name: 'John Doe',
                displayName: 'John Doe',
                nativeIdentity: 'acc-123',
                sourceName: 'HR Source',
            } as any
            const result = buildFormName(fusionAccount, 'Fusion Review')
            expect(result).toBe('Fusion Review - John Doe [HR Source] (acc-123)')
        })

        it('should use displayName when name is missing', () => {
            const fusionAccount = {
                displayName: 'Jane Smith',
                nativeIdentity: 'acc-999',
                sourceName: 'IT',
            } as any
            const result = buildFormName(fusionAccount, 'Review')
            expect(result).toBe('Review - Jane Smith [IT] (acc-999)')
        })

        it('should use Unknown when both name and displayName missing', () => {
            const fusionAccount = { sourceName: 'S', managedAccountId: 'managed-1' } as any
            const result = buildFormName(fusionAccount, 'F')
            expect(result).toBe('F - Unknown [S] (managed-1)')
        })

        it('should use Unknown when no name fields are present', () => {
            const fusionAccount = { sourceName: 'S' } as any
            const result = buildFormName(fusionAccount, 'F')
            expect(result).toBe('F - Unknown [S] (unknown)')
        })

        it('should append native identity to the title', () => {
            const fusionAccount = {
                name: 'fcooper',
                nativeIdentity: 'aa7459e540f94cbdbaa859019ef5c4f1',
                sourceName: 'Active Directory',
            } as any
            const result = buildFormName(fusionAccount, 'Fusion Review')
            expect(result).toBe('Fusion Review - fcooper [Active Directory] (aa7459e540f94cbdbaa859019ef5c4f1)')
        })
    })

    describe('calculateExpirationDate', () => {
        it('should add days to current date', () => {
            const base = new Date('2024-01-15')
            jest.useFakeTimers()
            jest.setSystemTime(base)

            const result = calculateExpirationDate(10)
            const expected = new Date(base)
            expected.setDate(expected.getDate() + 10)
            expect(new Date(result).toDateString()).toBe(expected.toDateString())

            jest.useRealTimers()
        })
    })
    describe('buildCandidateList', () => {
        it('should sort candidates by combined score and limit to maxCandidates', () => {
            const fusionAccount = {
                fusionMatches: [
                    {
                        identityId: 'id-1',
                        fusionIdentity: { identityId: 'id-1', attributes: { displayName: 'John Doe' } },
                        scores: [{ attribute: 'Combined score', score: 50 }],
                    },
                    {
                        identityId: 'id-2',
                        fusionIdentity: { identityId: 'id-2', attributes: { displayName: 'Jane Doe' } },
                        scores: [{ attribute: 'Combined score', score: 90 }],
                    },
                    {
                        identityId: 'id-3',
                        fusionIdentity: { identityId: 'id-3', attributes: { displayName: 'Jim Doe' } },
                        scores: [{ attribute: 'Combined score', score: 70 }],
                    },
                ],
            } as any

            const candidates = buildCandidateList(fusionAccount, 2)
            expect(candidates).toHaveLength(2)
            expect(candidates[0].id).toBe('id-2')
            expect(candidates[1].id).toBe('id-3')
        })

        it('should fall back to best non-skipped rule score if combined score is missing', () => {
            const fusionAccount = {
                fusionMatches: [
                    {
                        identityId: 'id-1',
                        fusionIdentity: { identityId: 'id-1', attributes: { displayName: 'John Doe' } },
                        scores: [
                            { attribute: 'rule1', score: 60, skipped: false },
                            { attribute: 'rule2', score: 80, skipped: false },
                        ],
                    },
                    {
                        identityId: 'id-2',
                        fusionIdentity: { identityId: 'id-2', attributes: { displayName: 'Jane Doe' } },
                        scores: [{ attribute: 'rule3', score: 100, skipped: true }],
                    },
                ],
            } as any

            const candidates = buildCandidateList(fusionAccount, 2)
            expect(candidates[0].id).toBe('id-1') // id-1 has 80, id-2 has 0 (since rule3 is skipped)
        })

        it('should fall back to identity ID locale compare for ties', () => {
            const fusionAccount = {
                fusionMatches: [
                    {
                        identityId: 'id-B',
                        fusionIdentity: { identityId: 'id-B', attributes: { displayName: 'B Doe' } },
                        scores: [{ attribute: 'Combined score', score: 50 }],
                    },
                    {
                        identityId: 'id-A',
                        fusionIdentity: { identityId: 'id-A', attributes: { displayName: 'A Doe' } },
                        scores: [{ attribute: 'Combined score', score: 50 }],
                    },
                ],
            } as any

            const candidates = buildCandidateList(fusionAccount, 2)
            expect(candidates[0].id).toBe('id-A')
            expect(candidates[1].id).toBe('id-B')
        })

        it('should throw an error if fusionAccount is not provided', () => {
            expect(() => buildCandidateList(null as any, 5)).toThrow()
        })

        it('should throw an error if maxCandidates is out of range', () => {
            const fusionAccount = { fusionMatches: [] } as any
            expect(() => buildCandidateList(fusionAccount, 0)).toThrow()
            expect(() => buildCandidateList(fusionAccount, 20)).toThrow()
        })

        it('should map matches to Candidate objects correctly', () => {
            const fusionAccount = {
                fusionMatches: [
                    {
                        identityId: 'id-1',
                        fusionIdentity: {
                            identityId: 'id-1',
                            attributes: { displayName: 'John Doe', department: 'IT' },
                        },
                        scores: [{ attribute: 'Combined score', score: 50 }],
                    },
                ],
            } as any

            const candidates = buildCandidateList(fusionAccount, 1)
            expect(candidates[0]).toEqual({
                id: 'id-1',
                name: 'John Doe',
                attributes: { displayName: 'John Doe', department: 'IT' },
                scores: [{ attribute: 'Combined score', score: 50 }],
            })
        })
    })

    describe('getFormOwner', () => {
        it('should return fusionSourceOwner from source service', () => {
            const sourceService = { fusionSourceOwner: { type: 'IDENTITY', id: 'owner-id', name: 'Owner' } } as any
            const owner = getFormOwner(sourceService)
            expect(owner).toEqual({ type: 'IDENTITY', id: 'owner-id', name: 'Owner' })
        })

        it('should throw an error if fusionSourceOwner is undefined', () => {
            const sourceService = { fusionSourceOwner: undefined } as any
            expect(() => getFormOwner(sourceService)).toThrow()
        })
    })
})
