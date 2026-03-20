import { compileAccountJmespathFilter } from '../accountJmespathFilter'

describe('compileAccountJmespathFilter', () => {
    it('returns undefined when expression is empty', () => {
        expect(compileAccountJmespathFilter('HR', undefined)).toBeUndefined()
        expect(compileAccountJmespathFilter('HR', '   ')).toBeUndefined()
    })

    it('filters accounts from page wrapper object', () => {
        const compiled = compileAccountJmespathFilter('HR', 'accounts[?attributes.department == `Engineering`]')
        const accounts = [
            { id: 'a1', attributes: { department: 'Engineering' } },
            { id: 'a2', attributes: { department: 'Finance' } },
        ] as any

        const filtered = compiled!.filterPage(accounts)
        expect(filtered).toHaveLength(1)
        expect(filtered[0].id).toBe('a1')
    })

    it('throws when expression is invalid', () => {
        expect(() => compileAccountJmespathFilter('HR', 'accounts[?')).toThrow(
            'Invalid Accounts JMESPath filter for source "HR"'
        )
    })

    it('throws when expression does not return an array', () => {
        const compiled = compileAccountJmespathFilter('HR', 'accounts[0].id')
        expect(() => compiled!.filterPage([{ id: 'a1' } as any])).toThrow(
            'must return an array'
        )
    })
})
