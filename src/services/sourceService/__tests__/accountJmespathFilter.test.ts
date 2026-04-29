import { compileAccountPageJmespathFilter } from '../accountFilters'

describe('compileAccountPageJmespathFilter', () => {
    it('returns undefined when expression is empty', () => {
        expect(compileAccountPageJmespathFilter('HR', undefined)).toBeUndefined()
        expect(compileAccountPageJmespathFilter('HR', '   ')).toBeUndefined()
    })

    it('filters accounts from page wrapper object', () => {
        const compiled = compileAccountPageJmespathFilter('HR', 'accounts[?attributes.department == `Engineering`]')
        const accounts = [
            { id: 'a1', attributes: { department: 'Engineering' } },
            { id: 'a2', attributes: { department: 'Finance' } },
        ] as any

        const filtered = compiled!.filterAccountPage(accounts)
        expect(filtered).toHaveLength(1)
        expect(filtered[0].id).toBe('a1')
    })

    it('throws when expression is invalid', () => {
        expect(() => compileAccountPageJmespathFilter('HR', 'accounts[?')).toThrow(
            'Invalid Accounts JMESPath filter for source "HR"'
        )
    })

    it('throws when expression does not return an array', () => {
        const compiled = compileAccountPageJmespathFilter('HR', 'accounts[0].id')
        expect(() => compiled!.filterAccountPage([{ id: 'a1' } as any])).toThrow(
            'must return an array'
        )
    })
})
