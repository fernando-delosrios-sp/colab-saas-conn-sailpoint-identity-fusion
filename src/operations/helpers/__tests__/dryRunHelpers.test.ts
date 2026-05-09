import {
    hostnameSegmentFromBaseurl,
    streamUncorrelatedAnalyzedRows,
    DryRunRuntimeOptions,
    DryRunRowEmitter,
} from '../dryRunHelpers'

describe('hostnameSegmentFromBaseurl', () => {
    it('uses the first DNS label, not the full FQDN', () => {
        expect(hostnameSegmentFromBaseurl('https://acme.api.identitynow.com/foo')).toBe('acme')
        expect(hostnameSegmentFromBaseurl('https://tenant.example.api.identitynow.com')).toBe('tenant')
    })

    it('returns single-label hosts unchanged', () => {
        expect(hostnameSegmentFromBaseurl('http://localhost:3000')).toBe('localhost')
    })

    it('keeps IPv4 as a sanitized segment', () => {
        expect(hostnameSegmentFromBaseurl('http://192.168.0.12')).toBe('192_168_0_12')
    })

    it('handles missing or invalid baseurl', () => {
        expect(hostnameSegmentFromBaseurl(undefined)).toBe('unknown-host')
        expect(hostnameSegmentFromBaseurl('')).toBe('unknown-host')
        expect(hostnameSegmentFromBaseurl('not-a-url')).toBe('unknown-host')
    })
})
import { DryRunOptionEmitCounter } from '../buildDryRunPayload'
import { FusionAccount } from '../../../model/account'
import { buildReportAccountIndex } from '../buildDryRunPayload'
import * as buildDryRunPayload from '../buildDryRunPayload'

jest.mock('../buildDryRunPayload', () => ({
    ...jest.requireActual('../buildDryRunPayload'),
    enrichISCAccountWithMatching: jest.fn(),
}))

describe('streamUncorrelatedAnalyzedRows', () => {
    let mockContext: any
    let mockAnalyzedAccounts: FusionAccount[]
    let mockReportIndex: any
    let mockPendingReview: any
    let mockDecisionAccountIds: Set<string>
    let mockCoveredManagedAccountIds: Set<string>
    let mockEmittedRowKeys: Set<string>
    let mockOptionEmitCounter: DryRunOptionEmitCounter
    let mockRowEmitter: DryRunRowEmitter
    let runtimeOptions: DryRunRuntimeOptions

    beforeEach(() => {
        mockContext = {
            log: { info: jest.fn() },
            fusion: { getISCAccount: jest.fn() },
            schemas: { fusionIdentityAttribute: 'id' },
            config: { baseurl: 'http://localhost' },
            sources: { resolveIscAccountIdForManagedKey: jest.fn((id: string) => id) },
        }
        mockAnalyzedAccounts = []
        mockReportIndex = buildReportAccountIndex([])
        mockPendingReview = {}
        mockDecisionAccountIds = new Set()
        mockCoveredManagedAccountIds = new Set()
        mockEmittedRowKeys = new Set()
        mockOptionEmitCounter = {
            includeNonMatched: 0,
            includeMatched: 0,
            includeExact: 0,
            includeDeferred: 0,
            includeReview: 0,
            includeDecisions: 0,
            reviewErrors: 0,
            includeExisting: 0,
        }
        mockRowEmitter = {
            emitRow: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
            diskOutputPath: 'test-path',
        }
        runtimeOptions = {
            includeExisting: false,
            includeNonMatched: true,
            includeMatched: true,
            includeExact: true,
            includeDeferred: true,
            includeReview: true,
            includeDecisions: true,
            writeToDisk: false,
        }
        jest.clearAllMocks()
    })

    it('returns sentRows immediately if selectedCategories is empty', async () => {
        const noCategoryOptions = {
            ...runtimeOptions,
            includeNonMatched: false,
            includeMatched: false,
            includeExact: false,
            includeDeferred: false,
            includeReview: false,
            includeDecisions: false,
        }
        const result = await streamUncorrelatedAnalyzedRows(
            mockContext,
            mockAnalyzedAccounts,
            mockReportIndex,
            mockPendingReview,
            mockDecisionAccountIds,
            mockCoveredManagedAccountIds,
            mockEmittedRowKeys,
            mockOptionEmitCounter,
            mockRowEmitter,
            5,
            noCategoryOptions
        )
        expect(result).toBe(0) // The function returns 0 if selectedCategories.size === 0
    })

    it('returns total sentRows when there are no analyzed uncorrelated accounts', async () => {
        const result = await streamUncorrelatedAnalyzedRows(
            mockContext,
            [],
            mockReportIndex,
            mockPendingReview,
            mockDecisionAccountIds,
            mockCoveredManagedAccountIds,
            mockEmittedRowKeys,
            mockOptionEmitCounter,
            mockRowEmitter,
            10,
            runtimeOptions
        )
        expect(result).toBe(10)
        expect(mockContext.log.info).toHaveBeenCalledWith('Uncorrelated managed account streaming emitted 10 row(s)')
    })

    it('processes accounts and emits them', async () => {
        mockAnalyzedAccounts = [{ nativeIdentity: 'user1' } as any, { nativeIdentity: 'user2' } as any]

        const iscOutput1 = { attributes: { id: 'user1' } }
        const iscOutput2 = { attributes: { id: 'user2' } }

        mockContext.fusion.getISCAccount.mockResolvedValueOnce(iscOutput1).mockResolvedValueOnce(iscOutput2)

        const enrichMock = buildDryRunPayload.enrichISCAccountWithMatching as jest.Mock
        enrichMock.mockReturnValueOnce({
            account: { attributes: { id: 'user1', statuses: ['nonMatched'] } },
            status: 'non-matched',
        })
        enrichMock.mockReturnValueOnce({
            account: { attributes: { id: 'user2', statuses: ['nonMatched'] } },
            status: 'non-matched',
        })

        const result = await streamUncorrelatedAnalyzedRows(
            mockContext,
            mockAnalyzedAccounts,
            mockReportIndex,
            mockPendingReview,
            mockDecisionAccountIds,
            mockCoveredManagedAccountIds,
            mockEmittedRowKeys,
            mockOptionEmitCounter,
            mockRowEmitter,
            0,
            runtimeOptions
        )

        expect(result).toBe(2)
        expect(mockContext.fusion.getISCAccount).toHaveBeenCalledTimes(2)
        expect(enrichMock).toHaveBeenCalledTimes(2)
        expect(mockRowEmitter.emitRow).toHaveBeenCalledTimes(2)
        expect(mockCoveredManagedAccountIds.size).toBe(0) // No accounts array in output
    })

    it('skips account if getISCAccount returns falsy', async () => {
        mockAnalyzedAccounts = [{ nativeIdentity: 'user1' } as any]
        mockContext.fusion.getISCAccount.mockResolvedValueOnce(null)

        const result = await streamUncorrelatedAnalyzedRows(
            mockContext,
            mockAnalyzedAccounts,
            mockReportIndex,
            mockPendingReview,
            mockDecisionAccountIds,
            mockCoveredManagedAccountIds,
            mockEmittedRowKeys,
            mockOptionEmitCounter,
            mockRowEmitter,
            5,
            runtimeOptions
        )

        expect(result).toBe(5)
        expect(mockContext.fusion.getISCAccount).toHaveBeenCalledTimes(1)
        expect(buildDryRunPayload.enrichISCAccountWithMatching).not.toHaveBeenCalled()
        expect(mockRowEmitter.emitRow).not.toHaveBeenCalled()
    })
})
