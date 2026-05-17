import jmespath from 'jmespath'
import { compileAccountPageJmespathFilter, buildIscAccountsQueryFilter } from '../accountFilters'

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

    it('throws ConnectorError with syntax details when expression is invalid during eager compilation', () => {
        expect(() => compileAccountPageJmespathFilter('HR', 'accounts[?')).toThrow(
            /Invalid Accounts JMESPath filter for source "HR": Invalid token/
        )
    })

    it('returns empty array when jmespath search returns null', () => {
        const compiled = compileAccountPageJmespathFilter('HR', 'doesNotExist')
        expect(compiled!.filterAccountPage([{ id: 'a1' } as any])).toEqual([])
    })

    it('throws when jmespath search execution fails during pagination', () => {
        const compiled = compileAccountPageJmespathFilter('HR', 'accounts')
        // Mock search to throw specifically when evaluating the page (not during compilation)

        const originalSearch = jmespath.search
        jest.spyOn(jmespath, 'search').mockImplementation((data, expr) => {
            if ((data as any).accounts && (data as any).accounts.length > 0) {
                throw new Error('Runtime execution error')
            }
            return originalSearch(data, expr)
        })
        try {
            expect(() => compiled!.filterAccountPage([{ id: 'a1' } as any])).toThrow(
                /Invalid Accounts JMESPath filter for source "HR": Runtime execution error/
            )
        } finally {
            jest.restoreAllMocks()
        }
    })

    it('throws when expression returns an array containing non-objects', () => {
        const compiled = compileAccountPageJmespathFilter('HR', 'accounts[*].id')
        expect(() => compiled!.filterAccountPage([{ id: 'a1' } as any])).toThrow(
            /must return an array of account objects/
        )
    })

    it('throws when expression does not return an array', () => {
        const compiled = compileAccountPageJmespathFilter('HR', 'accounts[0].id')
        expect(() => compiled!.filterAccountPage([{ id: 'a1' } as any])).toThrow('must return an array')
    })
})

describe('buildIscAccountsQueryFilter', () => {
    it('returns a basic sourceId filter when no extra filters or managed filters exist', () => {
        const sourceInfo = { id: 's1', isManaged: false } as any
        const result = buildIscAccountsQueryFilter(sourceInfo)
        expect(result).toBe('sourceId eq "s1"')
    })

    it('appends extra filters', () => {
        const sourceInfo = { id: 's1', isManaged: false } as any
        const result = buildIscAccountsQueryFilter(sourceInfo, 'name eq "test"')
        expect(result).toBe('sourceId eq "s1" and name eq "test"')
    })

    it('appends managed source accountFilter config when available', () => {
        const sourceInfo = {
            id: 's1',
            isManaged: true,
            config: { accountFilter: 'attributes.city eq "Austin"' },
        } as any
        const result = buildIscAccountsQueryFilter(sourceInfo)
        expect(result).toBe('sourceId eq "s1" and (attributes.city eq "Austin")')
    })
})
