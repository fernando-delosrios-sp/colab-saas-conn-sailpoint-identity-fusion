import Handlebars from 'handlebars'

import { hasPresentAttributeValue, isDefined } from '../../utils/safeRead'

import {
    mailtoHrefForHtmlAttribute,
    maxDisplayCharsForAccountAttributeValue,
    truncateWithEllipsis,
} from './accountAttributeValueDisplay'

/**
 * Register Handlebars helpers for common operations (email/report templates).
 */
export const registerHandlebarsHelpers = (): void => {
    const algorithmLabels: Record<string, string> = {
        'name-matcher': 'Name Matcher',
        'jaro-winkler': 'Jaro-Winkler',
        lig3: 'LIG3',
        dice: 'Dice',
        'double-metaphone': 'Double Metaphone',
        custom: 'Custom',
        average: 'Combined match score (legacy)',
        'weighted-mean': 'Combined score',
    }
    const formatDateYmd = (date: string | Date): string => {
        const d = typeof date === 'string' ? new Date(date) : date
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'N/A'
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}/${month}/${day}`
    }

    Handlebars.registerHelper('formatAttribute', (value: unknown) => {
        if (!isDefined(value)) {
            return 'N/A'
        }
        if (typeof value === 'object') {
            return JSON.stringify(value)
        }
        return String(value)
    })

    const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const accountAttrMaxChars = maxDisplayCharsForAccountAttributeValue()

    /** Renders attribute values; long text is shortened with a character budget; emails become mailto links (triple braces in templates). */
    Handlebars.registerHelper('formatAccountAttributeValue', (_attributeKey: unknown, value: unknown) => {
        if (!isDefined(value)) {
            return 'N/A'
        }
        if (typeof value === 'object') {
            const raw = JSON.stringify(value)
            const { display, title } = truncateWithEllipsis(raw, accountAttrMaxChars)
            const escDisplay = Handlebars.escapeExpression(display)
            const titleAttr = title ? ` title="${Handlebars.escapeExpression(title)}"` : ''
            return new Handlebars.SafeString(
                `<span style="word-break:break-word; overflow-wrap:anywhere;"${titleAttr}>${escDisplay}</span>`,
            )
        }
        const str = String(value).trim()
        const { display, title } = truncateWithEllipsis(str, accountAttrMaxChars)
        const escDisplay = Handlebars.escapeExpression(display)
        const titleAttr = title ? ` title="${Handlebars.escapeExpression(title)}"` : ''
        const linkStyle = 'color:#0b5cab;text-decoration:underline;'

        if (!emailAddressPattern.test(str)) {
            return new Handlebars.SafeString(
                `<span style="word-break:break-word; overflow-wrap:anywhere;"${titleAttr}>${escDisplay}</span>`,
            )
        }
        const href = mailtoHrefForHtmlAttribute(str)
        const escFull = Handlebars.escapeExpression(str)
        return new Handlebars.SafeString(
            `<a href="${href}" title="${escFull}" style="${linkStyle}">${escDisplay}</a>`,
        )
    })

    Handlebars.registerHelper('formatScores', (scores: any[]) => {
        if (!scores || scores.length === 0) {
            return 'N/A'
        }
        return scores
            .map((score) => {
                const num = typeof score.score === 'number' ? score.score : Number.parseFloat(String(score.score))
                const trimmedScore = Number.isFinite(num) ? parseFloat(num.toFixed(2)) : score.score
                return `${score.attribute}: ${trimmedScore}% (${score.isMatch ? 'Match' : 'No Match'})`
            })
            .join(', ')
    })

    Handlebars.registerHelper('formatPercent', (value: unknown) => {
        const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
        if (Number.isNaN(num)) return '0'
        return String(Math.round(num))
    })

    Handlebars.registerHelper('isFiniteNumber', (value: unknown) => typeof value === 'number' && Number.isFinite(value))

    Handlebars.registerHelper('multiply', (a: unknown, b: unknown) => {
        const left = typeof a === 'number' ? a : Number.parseFloat(String(a))
        const right = typeof b === 'number' ? b : Number.parseFloat(String(b))
        if (Number.isNaN(left) || Number.isNaN(right)) return 0
        return Math.round(left * right)
    })

    Handlebars.registerHelper('exists', (value: unknown) => {
        return hasPresentAttributeValue(value)
    })

    Handlebars.registerHelper('anyExists', (...args: unknown[]) => {
        const values = args.slice(0, -1)
        return values.some((value) => hasPresentAttributeValue(value))
    })

    Handlebars.registerHelper('decisionAssigned', (decisions: unknown, outcome: unknown) => {
        const decisionValue = Number.parseInt(String(decisions ?? ''), 10)
        if (!Number.isFinite(decisionValue)) return '-'
        const outcomeValue = Number.parseInt(String(outcome ?? '0'), 10)
        if (!Number.isFinite(outcomeValue)) return String(Math.max(decisionValue, 0))
        return String(Math.max(decisionValue - outcomeValue, 0))
    })

    Handlebars.registerHelper('gt', (a: number, b: number) => {
        return a > b
    })

    Handlebars.registerHelper('gte', (a: number, b: number) => {
        return a >= b
    })

    Handlebars.registerHelper('formatDate', (date: string | Date) => {
        if (!date) {
            return 'N/A'
        }
        return formatDateYmd(date)
    })

    Handlebars.registerHelper('algorithmLabel', (algorithm?: string) => {
        if (!algorithm) return 'N/A'
        return algorithmLabels[String(algorithm)] ?? String(algorithm)
    })

    Handlebars.registerHelper('isAverageScoreRow', (attribute?: string, algorithm?: string) => {
        const attr = String(attribute ?? '')
        const alg = String(algorithm ?? '')
        return (
            attr === 'Average Score' ||
            attr === 'Combined score' ||
            attr === 'Combined match score' ||
            alg === 'average' ||
            alg === 'weighted-mean'
        )
    })

    Handlebars.registerHelper('sourceTypeLabel', (sourceType: string) => {
        const labels: Record<string, string> = {
            authoritative: 'Authoritative',
            record: 'Record',
            orphan: 'Orphan',
        }
        return labels[sourceType] ?? sourceType
    })

    Handlebars.registerHelper('chunk', (arr: any[], size: any) => {
        const n = Math.max(1, Number.parseInt(String(size), 10) || 1)
        if (!Array.isArray(arr) || arr.length === 0) return []
        const out: any[] = []
        for (let i = 0; i < arr.length; i += n) {
            const row = arr.slice(i, i + n)
            while (row.length < n) row.push(null)
            out.push(row)
        }
        return out
    })

    Handlebars.registerHelper('processingStatsCards', (reportDate: Date | string, stats: Record<string, any>) => {
        if (!stats || typeof stats !== 'object') return []
        const cards: Array<{ label: string; value: string }> = []
        const pushCard = (label: string, value: any): void => {
            if (!hasPresentAttributeValue(value)) return
            cards.push({ label, value: String(value) })
        }
        const formattedDate = reportDate ? formatDateYmd(reportDate) : undefined

        pushCard('Report Date', formattedDate)
        pushCard('Total Processing Time', stats.totalProcessingTime)
        pushCard('Used Memory', stats.usedMemory)
        pushCard('Fusion Accounts Found', stats.fusionAccountsFound)
        pushCard('Identities Found', stats.identitiesFound)
        pushCard('Managed Accounts Found', stats.managedAccountsFound)
        pushCard('Managed Accounts Processed', stats.managedAccountsProcessed)
        pushCard('Identities Processed', stats.identitiesProcessed)
        pushCard('Fusion Reviews Processed', stats.fusionReviewsProcessed)
        pushCard('Fusion Reviews Found', stats.fusionReviewsFound)
        pushCard('Fusion Review Instances Found', stats.fusionReviewInstancesFound)
        pushCard('Fusion Automatic Matches', stats.fusionAutomaticMatches)

        return cards
    })

    const PIPELINE_PHASE_ORDER = [
        'Setup',
        'Fetch',
        'Refresh',
        'Process',
        'Unique attributes',
        'Output',
    ] as const

    /** Ordered phase tiles for HTML; missing phases show an em dash. */
    Handlebars.registerHelper('orderedPhaseTimingEntries', (stats: Record<string, unknown> | null | undefined) => {
        const raw = stats?.phaseTiming
        const byPhase = new Map<string, string>()
        if (Array.isArray(raw)) {
            for (const e of raw) {
                if (e && typeof e === 'object' && typeof (e as { phase?: string }).phase === 'string') {
                    const phase = (e as { phase: string }).phase
                    const elapsed = (e as { elapsed?: unknown }).elapsed
                    byPhase.set(phase, isDefined(elapsed) ? String(elapsed) : '—')
                }
            }
        }
        return PIPELINE_PHASE_ORDER.map((phase) => ({
            phase,
            elapsed: byPhase.get(phase) ?? '—',
        }))
    })
}
