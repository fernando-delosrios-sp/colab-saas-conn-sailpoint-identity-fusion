import Handlebars from 'handlebars'

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
        average: 'Average Score',
    }
    const formatDateYmd = (date: string | Date): string => {
        const d = typeof date === 'string' ? new Date(date) : date
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'N/A'
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}/${month}/${day}`
    }

    Handlebars.registerHelper('formatAttribute', (value: any) => {
        if (value === null || value === undefined) {
            return 'N/A'
        }
        if (typeof value === 'object') {
            return JSON.stringify(value)
        }
        return String(value)
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

    Handlebars.registerHelper('formatPercent', (value: any) => {
        const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
        if (Number.isNaN(num)) return '0'
        return String(Math.round(num))
    })

    Handlebars.registerHelper('multiply', (a: any, b: any) => {
        const left = typeof a === 'number' ? a : Number.parseFloat(String(a))
        const right = typeof b === 'number' ? b : Number.parseFloat(String(b))
        if (Number.isNaN(left) || Number.isNaN(right)) return 0
        return Math.round(left * right)
    })

    Handlebars.registerHelper('exists', (value: any) => {
        return value !== null && value !== undefined && value !== ''
    })

    Handlebars.registerHelper('anyExists', (...args: any[]) => {
        const values = args.slice(0, -1)
        return values.some((value) => value !== null && value !== undefined && value !== '')
    })

    Handlebars.registerHelper('decisionAssigned', (decisions: any, outcome: any) => {
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
        return attr === 'Average Score' || alg === 'average'
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
            if (value === null || value === undefined || value === '') return
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

        return cards
    })
}
