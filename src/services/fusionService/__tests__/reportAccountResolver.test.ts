import { describe, it, expect, vi } from 'vitest'
import type { FusionAccount } from '../../../model/account'
import { FusionRun } from '../../../model/fusionRun'
import {
    isReportableIscAccountId,
    resolveManagedAccountIscIdForReport,
    resolveReportAccountId,
    resolveReportAccountIdValue,
} from '../reportAccountResolver'

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

    it('rejects composite keys returned by sourceService', () => {
        const account = { iscAccountId: undefined, managedAccountId: 'src::nat-1' } as FusionAccount
        expect(resolveReportAccountId(account, makeSources('src::nat-1'))).toBeUndefined()
    })

    it('returns undefined when neither id is resolvable', () => {
        const account = { iscAccountId: undefined, managedAccountId: undefined } as FusionAccount
        expect(resolveReportAccountId(account, makeSources())).toBeUndefined()
    })

    it('resolves a managed source account id value', () => {
        const sources = makeSources('resolved-isc')
        expect(resolveReportAccountIdValue('src::nat-1', sources)).toBe('resolved-isc')
        expect(sources.resolveIscAccountIdForManagedKey).toHaveBeenCalledWith('src::nat-1')
    })

    it('returns undefined for empty account id value', () => {
        expect(resolveReportAccountIdValue(undefined, makeSources())).toBeUndefined()
    })

    it('identifies reportable ISC account ids', () => {
        expect(isReportableIscAccountId('isc-123')).toBe(true)
        expect(isReportableIscAccountId('src::nat-1')).toBe(false)
    })

    it('resolves managed account ISC id from inventory for report decisions', () => {
        const run = new FusionRun()
        run.managedAccountInventory.set('src-a::native-1', {
            id: 'isc-from-inventory',
            name: 'User',
            sourceName: 'Source A',
        })
        const sources = makeSources(undefined)
        expect(
            resolveManagedAccountIscIdForReport('src-a::native-1', sources, run, {
                storedIscAccountId: undefined,
            })
        ).toBe('isc-from-inventory')
    })
})

