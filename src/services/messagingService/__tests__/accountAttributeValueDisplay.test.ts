import {
    mailtoHrefForHtmlAttribute,
    maxDisplayCharsForAccountAttributeValue,
    truncateWithEllipsis,
} from '../accountAttributeValueDisplay'

describe('accountAttributeValueDisplay', () => {
    it('computes a stable positive char budget from layout constants', () => {
        const max = maxDisplayCharsForAccountAttributeValue()
        expect(max).toBeGreaterThanOrEqual(8)
        expect(max).toBeLessThanOrEqual(40)
    })

    it('does not truncate when within budget', () => {
        const max = maxDisplayCharsForAccountAttributeValue()
        const short = 'a'.repeat(Math.max(1, max - 2))
        expect(truncateWithEllipsis(short, max)).toEqual({ display: short, title: undefined })
    })

    it('truncates with ellipsis and preserves title when over budget', () => {
        const max = 10
        const full = 'alexander.ashford@umbrellacorp.com'
        const { display, title } = truncateWithEllipsis(full, max)
        expect(display.endsWith('\u2026')).toBe(true)
        expect(display.length).toBe(max)
        expect(title).toBe(full)
    })

    it('handles maxLen 1', () => {
        expect(truncateWithEllipsis('hello', 1)).toEqual({ display: '\u2026', title: 'hello' })
    })

    it('mailto href keeps @ visible for simple addresses', () => {
        expect(mailtoHrefForHtmlAttribute('annette.birkin@umbrellacorp.com')).toBe(
            'mailto:annette.birkin@umbrellacorp.com',
        )
    })

    it('mailto href encodes when address has HTML-sensitive characters', () => {
        expect(mailtoHrefForHtmlAttribute('a&b@c.com')).toBe('mailto:a%26b%40c.com')
    })
})
