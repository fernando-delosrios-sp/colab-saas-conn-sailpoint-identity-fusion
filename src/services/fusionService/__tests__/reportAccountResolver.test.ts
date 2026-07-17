import { describe, it, expect, vi } from 'vitest'
import { FusionAccount } from '../../model/account'
import { resolveReportAccountId, resolveReportAccountIdValue } from '../reportAccountResolver'

describe('reportAccountResolver', () => {
    const makeSources = (resolvedId?: string) =>
        ({ resolveIscAccountIdForManagedKey: vi.fn(() => resolvedId) }) as any

    it('prefers the account iscAccountId when present', () => {
        const account = { iscAccountId: 'isc-123', managedAccountId: 'src::nat-1' } as FusionAccount
        expect(resolveReportAccountId(account, makeSources())).toBe('isc-123')
    })

    it('resolves managedAccountId via sourceService when iscAccountId is missing', () => {
        const account = { iscAccountId: undefined, managedAccountId: 'src::nat-1' } as FusionAccount
        const sources = makeSources('resolved-isc')
        expect(resolveReportAccountId(account, sources)).toBe('resolved-isc')
        expect(sources.resolveIscAccountIdForManagedKey).toHaveBeenCalledWith('src::nat-1')
    })

    it('returns undefined when neither id is resolvable', () => {
        const account = { iscAccountId: undefined, managedAccountId: undefined } as FusionAccount
        expect(resolveReportAccountId(account, makeSources())).toBeUndefined()
    })

    it('resolves a raw account id value', () => {
        const sources = makeSources('resolved-isc')
        expect(resolveReportAccountIdValue('src::nat-1', sources)).toBe('resolved-isc')
        expect(sources.resolveIscAccountIdForManagedKey).toHaveBeenCalledWith('src::nat-1')
    })

    it('returns undefined for empty account id value', () => {
        expect(resolveReportAccountIdValue(undefined, makeSources())).toBeUndefined()
    })
})
