/**
 * Email utility functions for normalization and validation.
 * Handles the various formats email addresses can be stored in ISC.
 */

// ============================================================================
// Email Normalization
// ============================================================================

/**
 * Normalizes an identity email attribute value into an array of valid email strings.
 * ISC tenants sometimes store email as a string, array, or nested object.
 *
 * @param value - The email value which could be string, array, or object
 * @returns Array of normalized email strings (empty array if none found)
 *
 * @example
 * normalizeEmailValue('user@example.com')
 * // Returns: ['user@example.com']
 *
 * normalizeEmailValue(['user@example.com', 'admin@example.com'])
 * // Returns: ['user@example.com', 'admin@example.com']
 *
 * normalizeEmailValue({ value: 'user@example.com' })
 * // Returns: ['user@example.com']
 */
export function normalizeEmailValue(value: unknown): string[] {
    if (!value) return []

    // Handle string values (including comma-separated lists from dry-run input)
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.length === 0) return []
        if (trimmed.includes(',')) {
            return trimmed
                .split(',')
                .flatMap((part) => normalizeEmailValue(part.trim()))
        }
        return [trimmed]
    }

    // Handle array values (recursively normalize each element)
    if (Array.isArray(value)) {
        const result: string[] = []
        for (const item of value) {
            result.push(...normalizeEmailValue(item))
        }
        return result
    }

    // Handle object values (check common email property names)
    if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>
        const maybe = obj.value ?? obj.email ?? obj.mail ?? obj.emailAddress
        return normalizeEmailValue(maybe)
    }

    return []
}

// ============================================================================
// Email Recipients
// ============================================================================

/**
 * Sanitizes an array of recipient email addresses.
 * - Filters out non-strings
 * - Trims whitespace
 * - Removes empty strings
 * - Removes duplicates
 *
 * @param recipients - Array of potential email addresses
 * @returns Sanitized array of unique email addresses
 */
export function sanitizeRecipients(recipients: (string | undefined | null)[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []

    for (const recipient of recipients) {
        if (typeof recipient !== 'string') continue

        const trimmed = recipient.trim()
        if (trimmed.length === 0) continue

        // Case-insensitive filtering (emails are case-insensitive in the local part technically,
        // but we normalize to lowercase for exact matching)
        const normalized = trimmed.toLowerCase()
        if (!seen.has(normalized)) {
            seen.add(normalized)
            result.push(trimmed) // Keep original casing
        }
    }

    return result
}

/**
 * Format recipients for ISC email workflow triggers.
 * The send-email action expects `recipientEmailList` as a string or array of strings.
 * A single address is sent as a plain string for maximum workflow-engine compatibility.
 */
export function formatWorkflowRecipientList(recipients: string[]): string | string[] {
    if (recipients.length === 1) return recipients[0]
    return recipients
}

export interface EmailWorkflowTriggerInput {
    recipients: string | string[]
    recipientEmailList: string | string[]
    subject: string
    body: string
}

/**
 * Build the workflow test trigger payload for fusion email delivery.
 * Includes both `recipients` and `recipientEmailList` so tenant workflows can map either key.
 */
export function buildEmailWorkflowTriggerInput(
    recipients: string[],
    subject: string,
    body: string
): EmailWorkflowTriggerInput {
    const recipientList = formatWorkflowRecipientList(recipients)
    return {
        recipients: recipientList,
        recipientEmailList: recipientList,
        subject,
        body,
    }
}

