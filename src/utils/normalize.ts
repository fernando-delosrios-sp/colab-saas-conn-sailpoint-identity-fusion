/**
 * Generic string normalization for connector utilities.
 * Domain-specific normalizers (Velocity context, name matching, form input) stay in their modules.
 */
export function normalizeWhitespace(value: string | undefined | null): string {
    return (value ?? '').trim().replace(/\s+/g, ' ')
}

export function normalizeLowercase(value: string | undefined | null): string {
    return normalizeWhitespace(value).toLowerCase()
}
