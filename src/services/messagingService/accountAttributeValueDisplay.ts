/**
 * Truncation for account attribute cells in fusion email/report templates.
 * Stays in sync with the fixed ~270px left summary column in fusion-*.hbs and helpers.ts.
 */

/** Outer account summary <td> width (see templates). */
const ACCOUNT_SUMMARY_COLUMN_PX = 270
/** Horizontal padding on that <td> (e.g. padding:8px 6px). */
const ACCOUNT_SUMMARY_TD_PAD_H_PX = 12
/** Reserved width for the label column (longest keys + border). */
const ATTR_LABEL_COLUMN_RESERVE_PX = 72
/** Horizontal padding on the value <td> (8px + 8px). */
const ATTR_VALUE_CELL_PAD_H_PX = 16
/** Value cell font-size in templates. */
const ATTR_VALUE_FONT_SIZE_PX = 12
/**
 * Average character width factor for 12px system sans-serif (slightly optimistic vs. prior 0.56).
 */
const AVG_CHAR_WIDTH_EM = 0.5

export function maxDisplayCharsForAccountAttributeValue(): number {
    const inner = ACCOUNT_SUMMARY_COLUMN_PX - ACCOUNT_SUMMARY_TD_PAD_H_PX
    const valueColumnPx = inner - ATTR_LABEL_COLUMN_RESERVE_PX - ATTR_VALUE_CELL_PAD_H_PX
    const charPx = ATTR_VALUE_FONT_SIZE_PX * AVG_CHAR_WIDTH_EM
    return Math.max(8, Math.floor(valueColumnPx / charPx))
}

export type TruncateWithEllipsisResult = {
    display: string
    /** When set, use as `title` tooltip (full untruncated text). */
    title: string | undefined
}

const ELLIPSIS_CHAR = '\u2026'

/**
 * `mailto:` href suitable for HTML attributes. Uses a literal `@` when safe so clients show a readable
 * tooltip; falls back to {@link encodeURIComponent} when the address contains characters that need encoding.
 */
export function mailtoHrefForHtmlAttribute(email: string): string {
    if (/[&"'<>]/.test(email)) {
        return `mailto:${encodeURIComponent(email)}`
    }
    return `mailto:${email}`
}

export function truncateWithEllipsis(full: string, maxLen: number): TruncateWithEllipsisResult {
    if (full.length <= maxLen) {
        return { display: full, title: undefined }
    }
    if (maxLen <= 1) {
        return { display: ELLIPSIS_CHAR, title: full }
    }
    const keep = maxLen - 1
    return { display: full.slice(0, keep) + ELLIPSIS_CHAR, title: full }
}
