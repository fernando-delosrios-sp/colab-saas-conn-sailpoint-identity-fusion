import { createUrlContext } from '../../../utils/url'
import { escapeHtml, renderAccountDisplayHtml, renderCandidatesDisplayHtml, renderIscUiLink } from '../formHtml'
import { Candidate } from '../types'

describe('form HTML helpers', () => {
    it('Untrusted values are HTML-escaped', () => {
        expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')

        const html = renderAccountDisplayHtml({
            accountLabel: 'Acct <b>One</b>',
            sourceName: 'HR & Payroll',
            attributes: { email: 'a@b.com<script>' },
            fusionFormAttributes: ['email'],
            locale: 'en',
        })
        expect(html).toContain('Acct &lt;b&gt;One&lt;/b&gt;')
        expect(html).toContain('HR &amp; Payroll')
        expect(html).toContain('a@b.com&lt;script&gt;')
        expect(html).not.toContain('<script>')
    })

    it('Missing URL falls back to escaped text', () => {
        const emptyCtx = createUrlContext(undefined)
        const accountHtml = renderAccountDisplayHtml({
            accountLabel: 'Pat Lee',
            sourceName: 'HR',
            attributes: {},
            fusionFormAttributes: [],
            locale: 'en',
            urlContext: emptyCtx,
        })
        expect(accountHtml).toContain('Pat Lee')
        expect(accountHtml).not.toContain('href=')

        const link = renderIscUiLink('Pat Lee', undefined)
        expect(link).toBe('Pat Lee')
        expect(link).not.toContain('href')

        const candidatesHtml = renderCandidatesDisplayHtml(
            [{ id: 'id-1', name: 'Sam <User>', attributes: {}, scores: [] }],
            'en',
            emptyCtx
        )
        expect(candidatesHtml).toContain('Sam &lt;User&gt;')
        expect(candidatesHtml).not.toContain('href=')
    })

    it('Identity and account links when UrlContext can build them', () => {
        const urlContext = createUrlContext('https://example.api.identitynow.com')
        const accountHtml = renderAccountDisplayHtml({
            accountLabel: 'Pat Lee',
            sourceName: 'HR',
            attributes: {},
            fusionFormAttributes: [],
            locale: 'en',
            urlContext,
            accountIscId: 'isc-acct-1',
        })
        expect(accountHtml).toContain(
            'href="https://example.identitynow.com/ui/a/admin/accounts-management/human-accounts/isc-acct-1"'
        )
        expect(accountHtml).toContain('target="_blank"')
        expect(accountHtml).toContain('rel="noopener noreferrer"')

        const candidatesHtml = renderCandidatesDisplayHtml(
            [{ id: 'ident-99', name: 'Sam User', attributes: {}, scores: [] }],
            'en',
            urlContext
        )
        expect(candidatesHtml).toContain(
            'href="https://example.identitynow.com/ui/a/admin/identities/ident-99/details/attributes"'
        )
        expect(candidatesHtml).toContain('target="_blank"')
        expect(candidatesHtml).toContain('rel="noopener noreferrer"')
    })

    it('Score rows carry the candidate value for the scored attribute', () => {
        const candidates: Candidate[] = [
            {
                id: 'ident-1',
                name: 'Sam User',
                attributes: { firstname: 'Sam', email: 'sam@example.com' },
                scores: [
                    { attribute: 'firstname', algorithm: 'lig3', score: 92, weightedScore: 18, fusionScore: 50 },
                    { attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, fusionScore: 70 },
                ],
            },
        ]

        const html = renderCandidatesDisplayHtml(candidates, 'en')
        expect(html).toContain('>Sam<')
        // The combined-score row has no attribute of its own.
        expect(html).toContain('>—<')
    })

    it('Candidate attribute values are HTML-escaped', () => {
        const candidates: Candidate[] = [
            {
                id: 'ident-1',
                name: 'Sam User',
                attributes: { email: '<script>x</script>' },
                scores: [{ attribute: 'email', algorithm: 'lig3', score: 10, weightedScore: 2, fusionScore: 50 }],
            },
        ]

        const html = renderCandidatesDisplayHtml(candidates, 'en')
        expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
        expect(html).not.toContain('<script>')
    })

    it('Candidate score table matches the review email columns', () => {
        const candidates: Candidate[] = [
            {
                id: 'ident-1',
                name: 'Sam User',
                attributes: {},
                scores: [
                    {
                        attribute: 'email',
                        algorithm: 'lig3',
                        score: 92,
                        weightedScore: 18,
                        fusionScore: 50,
                        isMatch: true,
                    },
                    {
                        attribute: 'department',
                        algorithm: 'jaro-winkler',
                        score: 40,
                        weightedScore: 8,
                        fusionScore: 80,
                        isMatch: false,
                    },
                    {
                        attribute: 'Combined score',
                        algorithm: 'weighted-mean',
                        score: 85,
                        fusionScore: 70,
                    },
                ],
            },
        ]

        const html = renderCandidatesDisplayHtml(candidates, 'en')
        expect(html).toContain('>Attribute<')
        expect(html).toContain('>Value<')
        expect(html).toContain('>Algorithm<')
        expect(html).toContain('>Threshold<')
        expect(html).toContain('>Result<')
        expect(html).toContain('>Score<')
        expect(html).toContain('#f0fdf4')
        expect(html).toContain('#fef2f2')
        expect(html).toContain('#e0f2fe')
        expect(html).toContain('#0b5cab')
        expect(html).toContain('LIG3')
        expect(html).toContain('50%')
        expect(html).toContain('92%')
        expect(html).toContain('18%')
    })
})
