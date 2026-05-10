import {
    mapScoreReportsForFusionReport,
    getFusionIdentityConflictTrackingKey,
    fusionReportMatchCandidateAccountFields,
    getFusionReportAccountLabel,
    buildMinimalFusionReportAccount,
    buildIdentityConflictWarningsFromMap,
} from '../fusionReportHelpers'
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
        it('should return trimmed nativeIdentity if present', () => {
            const acc = { nativeIdentityOrUndefined: '  user123  ' } as any
            expect(getFusionIdentityConflictTrackingKey(acc)).toBe('user123')
        })

        it('should fall back to name if nativeIdentity is missing', () => {
            const acc = { name: 'John Doe' } as any
            expect(getFusionIdentityConflictTrackingKey(acc)).toBe('name:John Doe')
        })

        it('should fall back to displayName if nativeIdentity and name are missing', () => {
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

        it('should use nativeIdentityOrUndefined from fusionIdentity if identityId is missing', () => {
            const match = {
                fusionIdentity: {
                    nativeIdentityOrUndefined: ' nat1 ',
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

    describe('getFusionReportAccountLabel', () => {
        it('should return name if present', () => {
            const acc = { name: '  My Name  ', identityDisplayName: 'IDN Name' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('My Name')
        })

        it('should fallback to identityDisplayName', () => {
            const acc = { identityDisplayName: '  IDN Name  ', displayName: 'Disp Name' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('IDN Name')
        })

        it('should fallback to displayName', () => {
            const acc = { displayName: '  Disp Name  ', managedAccountId: 'mgd1' } as any
            expect(getFusionReportAccountLabel(acc)).toBe('Disp Name')
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
            humanAccount: jest.fn((id) => `http://example.com/human/${id}`),
        } as any

        beforeEach(() => {
            jest.clearAllMocks()
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
                    attr3: 'val3'
                }
            } as any
            const result = buildMinimalFusionReportAccount(
                acc,
                mockUrlContext,
                SourceType.Record,
                ['attr1', 'attr2']
            )

            expect(result).toEqual({
                accountName: 'Test Acc',
                accountUrl: 'http://example.com/human/acc1',
                accountSource: 'Source 1',
                sourceType: SourceType.Record,
                accountId: 'acc1',
                accountEmail: 'test@example.com',
                accountAttributes: {
                    attr1: 'val1',
                    attr2: 'val2'
                },
                matches: [],
            })
            expect(mockUrlContext.humanAccount).toHaveBeenCalledWith('acc1')
        })

        it('should handle missing sourceType by falling back to Authoritative', () => {
            const acc = {
                name: 'Test Acc',
                managedAccountId: 'acc1',
            } as any
            const result = buildMinimalFusionReportAccount(
                acc,
                mockUrlContext,
                undefined,
                []
            )

            expect(result.sourceType).toBe(SourceType.Authoritative)
        })

        it('should include error if provided', () => {
            const acc = { name: 'Test Acc' } as any
            const result = buildMinimalFusionReportAccount(
                acc,
                mockUrlContext,
                undefined,
                [],
                'Some error'
            )

            expect(result.error).toBe('Some error')
        })

        it('should use accountIdOverride if provided', () => {
            const acc = { name: 'Test Acc', managedAccountId: 'orig1' } as any
            const result = buildMinimalFusionReportAccount(
                acc,
                mockUrlContext,
                undefined,
                [],
                undefined,
                'overridden1'
            )

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
            expect(result?.identityConflicts?.occurrences[0].nativeIdentities).toEqual(['nat1', 'nat2'])
            expect(result?.identityConflicts?.occurrences[0].accountNames).toEqual(['Account A', 'Account B'])
            expect(result?.identityConflicts?.occurrences[0].accountCount).toBe(2)

            expect(result?.identityConflicts?.occurrences[1].identityId).toBe('idB')
            expect(result?.identityConflicts?.occurrences[1].nativeIdentities).toEqual(['nat3', 'nat4'])
            expect(result?.identityConflicts?.occurrences[1].accountNames).toEqual(['Account Y', 'Account Z'])
        })
    })
})
