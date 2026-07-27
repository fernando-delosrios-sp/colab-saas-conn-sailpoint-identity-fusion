import {
    mapScoreReportsForFusionReport,
    getFusionIdentityConflictTrackingKey,
    fusionReportMatchCandidateAccountFields,
    getFusionReportAccountLabel,
    buildMinimalFusionReportAccount,
    buildIdentityConflictWarningsFromMap,
    buildFusionReportMatchesForReviewEmail,
} from '../helpers'
import { UrlContext } from '../../../utils/url'
import { SourceType } from '../../../model/config'

describe('fusionReportHelpers', () => {
    describe('mapScoreReportsForFusionReport', () => {
        it('should map ScoreReport to FusionReportScore correctly with rounded scores', () => {
            const reports = [
                {
                    attribute: 'email',
                    algorithm: 'exact',
                    score: 99.999,
                    weightedScore: 50.555,
                    fusionScore: 80,
                    isMatch: true,
                    skipped: false,
                    comment: 'Matched',
                } as any,
                {
                    attribute: 'name',
                    algorithm: 'jaro',
                    score: 80.123,
                    isMatch: false,
                } as any,
            ]

            const result = mapScoreReportsForFusionReport(reports)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                attribute: 'email',
                algorithm: 'exact',
                score: 100,
                weightedScore: 50.56,
                fusionScore: 80,
                isMatch: true,
                skipped: false,
                comment: 'Matched',
            })
            expect(result[1]).toEqual({
                attribute: 'name',
                algorithm: 'jaro',
                score: 80.12,
                weightedScore: undefined,
                fusionScore: undefined,
                isMatch: false,
                skipped: undefined,
                comment: undefined,
            })
        })
    })

    describe('getFusionIdentityConflictTrackingKey', () => {
        it('should return trimmed managedKey if present', () => {
            const acc = { managedKeyOrUndefined: '  user123  ' } as any
            expect(getFusionIdentityConflictTrackingKey(acc)).toBe('user123')
        })

        it('should fall back to name if managedKey is missing', () => {
            const acc = { name: 'John Doe' } as any
            expect(getFusionIdentityConflictTrackingKey(acc)).toBe('name:John Doe')
        })

        it('should fall back to displayName if managedKey and name are missing', () => {
            const acc = { displayName: 'John D' } as any
            expect(getFusionIdentityConflictTrackingKey(acc)).toBe('name:John D')
        })

        it('should fall back to unknown if all are missing', () => {
            const acc = {} as any
            expect(getFusionIdentityConflictTrackingKey(acc)).toBe('name:unknown')
        })
    })

    describe('fusionReportMatchCandidateAccountFields', () => {
        it('should use fusionIdentity when present', () => {
            const match = {
                fusionIdentity: {
                    identityId: '  id1  ',
                    name: 'Account 1',
                },
            } as any
            const result = fusionReportMatchCandidateAccountFields(match)
            expect(result).toEqual({
                accountId: 'id1',
                accountName: 'Account 1',
            })
        })

        it('should use managedKeyOrUndefined from fusionIdentity if identityId is missing', () => {
            const match = {
                fusionIdentity: {
                    managedKeyOrUndefined: ' nat1 ',
                    name: 'Account 1',
                },
            } as any
            const result = fusionReportMatchCandidateAccountFields(match)
            expect(result).toEqual({
                accountId: 'nat1',
                accountName: 'Account 1',
            })
        })

        it('should fallback to match.identityId and match.identityName when fusionIdentity is absent', () => {
            const match = {
                identityId: '  id2  ',
                identityName: 'Match Name',
            } as any
            const result = fusionReportMatchCandidateAccountFields(match)
            expect(result).toEqual({
                accountId: 'id2',
                accountName: 'Match Name',
            })
        })

        it('should return undefined accountId if match.identityId is missing and no fusionIdentity', () => {
            const match = {
                identityName: 'Match Name',
            } as any
            const result = fusionReportMatchCandidateAccountFields(match)
            expect(result).toEqual({
                accountId: undefined,
                accountName: 'Match Name',
            })
        })
    })

    describe('buildFusionReportMatchesForReviewEmail', () => {
        const urlContext = { identity: (id: string) => `https://tenant.identitynow.com/ui/a/admin/identities/${id}/details` } as UrlContext

        it('uses fusion account name when match.identityName is the identity id', () => {
            const matches = buildFusionReportMatchesForReviewEmail(
                [
                    {
                        identityId: 'd3a1cb345cf34b2ea6fc5f40686cad4c',
                        identityName: 'd3a1cb345cf34b2ea6fc5f40686cad4c',
                        fusionIdentity: {
                            identityId: 'd3a1cb345cf34b2ea6fc5f40686cad4c',
                            name: 'Michael Eckert',
                            attributes: {},
                        },
                        scores: [
                            {
                                attribute: 'firstname',
                                algorithm: 'jaro-winkler',
                                score: 92,
                                weightedScore: 46,
                                fusionScore: 50,
                                isMatch: true,
                            },
                        ],
                    } as any,
                ],
                urlContext,
                5
            )

            expect(matches[0].identityName).toBe('Michael Eckert')
            expect(matches[0].scores?.[0]).toMatchObject({ attribute: 'firstname', score: 92 })
        })
    })

    describe('getFusionReportAccountLabel', () => {
        it('should return identityAlias if present', () => {
            const acc = { name: '  My Name  ', identityAlias: 'IDN Name' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('IDN Name')
        })

        it('should fallback to identityName', () => {
            const acc = { identityName: '  Alias  ', displayName: 'Disp Name' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('Alias')
        })

        it('should fallback to name', () => {
            const acc = { name: '  My Name  ', managedAccountId: 'mgd1' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('My Name')
        })

        it('should fallback to managedAccountId', () => {
            const acc = { managedAccountId: '  mgd1  ' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('mgd1')
        })

        it('should fallback to identityId', () => {
            const acc = { identityId: '  id1  ' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('id1')
        })

        it('should fallback to Unknown if all are missing', () => {
            const acc = {} as any
            expect(getFusionReportAccountLabel(acc)).toBe('Unknown')
        })
    })

    describe('buildMinimalFusionReportAccount', () => {
        const mockUrlContext: UrlContext = {
            humanAccount: vi.fn((id) => (id ? `http://example.com/human/${id}` : undefined)),
        } as any

        beforeEach(() => {
            vi.clearAllMocks()
        })

        it('should build minimal account without error and accountIdOverride', () => {
            const acc = {
                name: 'Test Acc',
                managedAccountId: 'acc1',
                sourceName: 'Source 1',
                email: 'test@example.com',
                attributes: {
                    attr1: 'val1',
                    attr2: 'val2',
                    attr3: 'val3',
                },
            } as any
            const result = buildMinimalFusionReportAccount(acc, mockUrlContext, SourceType.Record, ['attr1', 'attr2'])

            expect(result).toEqual({
                accountName: 'Test Acc',
                accountUrl: undefined,
                accountSource: 'Source 1',
                sourceType: SourceType.Record,
                accountId: 'acc1',
                accountEmail: 'test@example.com',
                accountAttributes: {
                    attr1: 'val1',
                    attr2: 'val2',
                },
                matches: [],
            })
            expect(mockUrlContext.humanAccount).toHaveBeenCalledWith(undefined)
        })

        it('should handle missing sourceType by falling back to Authoritative', () => {
            const acc = {
                name: 'Test Acc',
                managedAccountId: 'acc1',
            } as any
            const result = buildMinimalFusionReportAccount(acc, mockUrlContext, undefined, [])

            expect(result.sourceType).toBe(SourceType.Authoritative)
        })

        it('should include error if provided', () => {
            const acc = { name: 'Test Acc' } as any
            const result = buildMinimalFusionReportAccount(acc, mockUrlContext, undefined, [], 'Some error')

            expect(result.error).toBe('Some error')
        })

        it('should use accountIdOverride if provided', () => {
            const acc = { name: 'Test Acc', managedAccountId: 'orig1' } as any
            const result = buildMinimalFusionReportAccount(acc, mockUrlContext, undefined, [], undefined, 'overridden1')

            expect(result.accountId).toBe('overridden1')
            expect(mockUrlContext.humanAccount).toHaveBeenCalledWith('overridden1')
        })
    })

    describe('buildIdentityConflictWarningsFromMap', () => {
        it('should return undefined for empty map', () => {
            expect(buildIdentityConflictWarningsFromMap(new Map())).toBeUndefined()
        })

        it('should return warnings for conflicting identities and sort correctly', () => {
            const conflictMap = new Map<string, Map<string, string>>()

            // Identity B
            const mapB = new Map<string, string>()
            mapB.set('nat3', 'Account Z')
            mapB.set('nat4', 'Account Y')
            conflictMap.set('idB', mapB)

            // Identity A
            const mapA = new Map<string, string>()
            mapA.set('nat2', 'Account B')
            mapA.set('nat1', 'Account A')
            conflictMap.set('idA', mapA)

            const result = buildIdentityConflictWarningsFromMap(conflictMap)

            expect(result).toBeDefined()
            expect(result?.identityConflicts?.affectedIdentities).toBe(2)
            expect(result?.identityConflicts?.occurrences).toHaveLength(2)

            // Should sort identities by ID
            expect(result?.identityConflicts?.occurrences[0].identityId).toBe('idA')
            expect(result?.identityConflicts?.occurrences[0].managedKeys).toEqual(['nat1', 'nat2'])
            expect(result?.identityConflicts?.occurrences[0].accountNames).toEqual(['Account A', 'Account B'])
            expect(result?.identityConflicts?.occurrences[0].accountCount).toBe(2)

            expect(result?.identityConflicts?.occurrences[1].identityId).toBe('idB')
            expect(result?.identityConflicts?.occurrences[1].managedKeys).toEqual(['nat3', 'nat4'])
            expect(result?.identityConflicts?.occurrences[1].accountNames).toEqual(['Account Y', 'Account Z'])
        })
    })
})

