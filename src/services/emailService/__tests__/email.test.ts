import {
    buildEmailWorkflowTriggerInput,
    formatWorkflowRecipientList,
    normalizeEmailValue,
} from '../email'

describe('email workflow recipient formatting', () => {
    it('uses a plain string for a single recipient', () => {
        expect(formatWorkflowRecipientList(['reviewer@example.com'])).toBe('reviewer@example.com')
    })

    it('uses a string array for multiple recipients', () => {
        expect(formatWorkflowRecipientList(['a@example.com', 'b@example.com'])).toEqual([
            'a@example.com',
            'b@example.com',
        ])
    })

    it('builds trigger input with recipients and recipientEmailList aliases', () => {
        expect(buildEmailWorkflowTriggerInput(['reviewer@example.com'], 'Subject', '<p>Body</p>')).toEqual({
            recipients: 'reviewer@example.com',
            recipientEmailList: 'reviewer@example.com',
            subject: 'Subject',
            body: '<p>Body</p>',
        })
    })

    it('splits comma-separated dry-run email strings', () => {
        expect(normalizeEmailValue('a@example.com, b@example.com')).toEqual([
            'a@example.com',
            'b@example.com',
        ])
    })
})
