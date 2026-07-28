import { parseDryRunInput, resolveIdentitiesFound } from '../accountListHelpers'

describe('parseDryRunInput', () => {
    it('returns undefined when dryRun is absent or enabled is false', () => {
        expect(parseDryRunInput({ schema: { attributes: [] } } as any)).toBeUndefined()
        expect(parseDryRunInput({ dryRun: { enabled: false, sendEmail: 'a@b.com' } } as any)).toBeUndefined()
    })

    it('parses sendEmail as a single string', () => {
        const result = parseDryRunInput({
            dryRun: { enabled: true, sendEmail: 'reviewer@example.com' },
        } as any)

        expect(result).toEqual({
            enabled: true,
            saveFile: false,
            sendEmail: ['reviewer@example.com'],
        })
    })

    it('parses sendEmail as an array of strings', () => {
        const result = parseDryRunInput({
            dryRun: { enabled: true, sendEmail: ['a@example.com', 'b@example.com'] },
        } as any)

        expect(result?.sendEmail).toEqual(['a@example.com', 'b@example.com'])
    })

    it('parses comma-separated sendEmail string into multiple recipients', () => {
        const result = parseDryRunInput({
            dryRun: { enabled: true, sendEmail: 'a@example.com, b@example.com' },
        } as any)

        expect(result?.sendEmail).toEqual(['a@example.com', 'b@example.com'])
    })

    it('omits sendEmail when no valid recipients remain after sanitization', () => {
        const result = parseDryRunInput({
            dryRun: { enabled: true, sendEmail: ['', '   '] },
        } as any)

        expect(result?.sendEmail).toBeUndefined()
    })
})

describe('resolveIdentitiesFound', () => {
    it('returns fetch-phase count when no supplemental loads occurred', () => {
        expect(
            resolveIdentitiesFound(
                {
                    identitiesFound: 3,
                    managedAccountsFound: 0,
                    managedAccountsFoundAuthoritative: 0,
                    managedAccountsFoundRecord: 0,
                    managedAccountsFoundOrphan: 0,
                },
                { identitiesLoadedCount: 3 }
            )
        ).toBe(3)
    })

    it('includes identities loaded after fetch for global reviewer or report targets', () => {
        expect(
            resolveIdentitiesFound(
                {
                    identitiesFound: 10,
                    managedAccountsFound: 0,
                    managedAccountsFoundAuthoritative: 0,
                    managedAccountsFoundRecord: 0,
                    managedAccountsFoundOrphan: 0,
                },
                { identitiesLoadedCount: 12 }
            )
        ).toBe(12)
    })

    it('falls back to fetch count when identities service is unavailable', () => {
        expect(
            resolveIdentitiesFound({
                identitiesFound: 7,
                managedAccountsFound: 0,
                managedAccountsFoundAuthoritative: 0,
                managedAccountsFoundRecord: 0,
                managedAccountsFoundOrphan: 0,
            })
        ).toBe(7)
    })
})


