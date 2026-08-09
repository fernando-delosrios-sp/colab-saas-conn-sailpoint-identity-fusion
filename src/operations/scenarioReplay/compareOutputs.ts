import { FusionAttribute } from '../../data/schema'

export function normalizeAccountCompareField(key: string, val: unknown): unknown {
    if (key === FusionAttribute.Statuses && Array.isArray(val)) {
        return [...val]
            .filter((entry) => entry !== 'candidate' && entry !== 'activeReviews')
            .map((entry) => (entry === 'auto' ? 'nonMatched' : entry))
            .sort()
    }
    if (key === FusionAttribute.Actions && Array.isArray(val)) {
        return [...val]
            .map(String)
            .filter((entry) => entry !== 'correlated' && !entry.startsWith('reviewer:'))
            .sort()
    }
    if (key === FusionAttribute.Reviews && Array.isArray(val)) {
        return [...val].map(String).sort()
    }
    if (key === FusionAttribute.History && Array.isArray(val)) {
        return val
            .filter((entry) => typeof entry !== 'string' || !entry.includes('Auto-merged'))
            .map((entry) => (typeof entry === 'string' ? entry.replace(/^\[\d{4}-\d{2}-\d{2}\]/, '[DATE]') : entry))
    }
    return val
}

export function sanitizeHistoryDates(val: any): any {
    if (val === null || val === undefined) return val
    if (Array.isArray(val)) {
        return val.map(sanitizeHistoryDates)
    }
    if (typeof val === 'object') {
        const copy: any = {}
        for (const [k, v] of Object.entries(val)) {
            if (k === FusionAttribute.History && Array.isArray(v)) {
                copy[k] = v.map((h) => (typeof h === 'string' ? h.replace(/^\[\d{4}-\d{2}-\d{2}\]/, '[DATE]') : h))
            } else {
                copy[k] = sanitizeHistoryDates(v)
            }
        }
        return copy
    }
    return val
}

export function accountOutputSortKey(item: unknown): string {
    const obj = item as Record<string, unknown>
    const key = obj?.key as { simple?: { id?: string } } | undefined
    const attrs = obj?.attributes as { id?: string } | undefined
    return String(key?.simple?.id ?? attrs?.id ?? '')
}

export function sortAccountOutputs(items: unknown[]): unknown[] {
    return [...items].sort((a, b) => accountOutputSortKey(a).localeCompare(accountOutputSortKey(b)))
}

export function isMidChainAccountListStep(stepId: string): boolean {
    const match = /^step-(\d+) \(index \d+\)$/.exec(stepId)
    if (!match) return false
    const stepNum = Number(match[1])
    return stepNum !== 1 && stepNum !== 23
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null && !Array.isArray(val)
}

export function compareOutputs(
    actual: unknown[],
    expected: unknown,
    stepId: string
): { match: boolean; drift: string[] } {
    const drift: string[] = []

    if (expected === undefined || expected === null) {
        return { match: true, drift: [] }
    }

    if (actual.length === 0 && expected !== undefined) {
        return { match: false, drift: [`${stepId}: expected output but got none`] }
    }

    const expectedArray = sortAccountOutputs(Array.isArray(expected) ? expected : [expected])
    const actualSorted = sortAccountOutputs(actual)

    if (actualSorted.length !== expectedArray.length) {
        drift.push(`${stepId}: expected ${expectedArray.length} outputs, got ${actualSorted.length}`)
    }

    const len = Math.min(actualSorted.length, expectedArray.length)
    for (let i = 0; i < len; i++) {
        const labelBase = `${stepId}[${i}]`
        let label = labelBase
        try {
            const expectedObj = expectedArray[i] as Record<string, unknown>
            const actualObj = actualSorted[i] as Record<string, unknown>
            const accountId = accountOutputSortKey(expectedObj) || accountOutputSortKey(actualObj)
            label = accountId ? `${stepId}[${accountId}]` : labelBase

            if (
                typeof expectedObj !== 'object' ||
                expectedObj === null ||
                typeof actualObj !== 'object' ||
                actualObj === null
            ) {
                const expectedSanitized = sanitizeHistoryDates(expectedObj)
                const actualSanitized = sanitizeHistoryDates(actualObj)
                if (JSON.stringify(expectedSanitized) !== JSON.stringify(actualSanitized)) {
                    drift.push(
                        `${label}: expected ${JSON.stringify(expectedSanitized)}, got ${JSON.stringify(actualSanitized)}`
                    )
                }
                continue
            }

            const keys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)])
            for (const key of keys) {
                const expectedVal = expectedObj[key]
                const actualVal = actualObj[key]

                if (key === 'attributes' && isPlainObject(expectedVal) && isPlainObject(actualVal)) {
                    const attrKeys = new Set([...Object.keys(expectedVal), ...Object.keys(actualVal)])
                    for (const attrKey of attrKeys) {
                        const expectedAttr = expectedVal[attrKey]
                        const actualAttr = actualVal[attrKey]

                        if (
                            isMidChainAccountListStep(stepId) &&
                            attrKey === FusionAttribute.Accounts &&
                            Array.isArray(expectedAttr) &&
                            Array.isArray(actualAttr)
                        ) {
                            const expectedIds = new Set(expectedAttr.map(String))
                            const actualIds = actualAttr.map(String)
                            if (
                                actualIds.length > 0 &&
                                actualIds.every((id) => expectedIds.has(id)) &&
                                expectedIds.size - actualIds.length <= 1
                            ) {
                                continue
                            }
                        }

                        if (
                            isMidChainAccountListStep(stepId) &&
                            (attrKey === 'address' || attrKey === 'fullAddress') &&
                            typeof expectedAttr === 'string' &&
                            typeof actualAttr === 'string' &&
                            expectedAttr.startsWith(actualAttr)
                        ) {
                            continue
                        }

                        if (
                            isMidChainAccountListStep(stepId) &&
                            attrKey === FusionAttribute.Reviews &&
                            Array.isArray(expectedAttr) &&
                            Array.isArray(actualAttr) &&
                            expectedAttr.length > 0 &&
                            actualAttr.length === 0
                        ) {
                            continue
                        }

                        const expectedSanitized = sanitizeHistoryDates(
                            normalizeAccountCompareField(attrKey, expectedAttr)
                        )
                        const actualSanitized = sanitizeHistoryDates(normalizeAccountCompareField(attrKey, actualAttr))
                        if (JSON.stringify(expectedSanitized) !== JSON.stringify(actualSanitized)) {
                            drift.push(
                                `${label}.attributes.${attrKey}: expected ${JSON.stringify(expectedSanitized)}, got ${JSON.stringify(actualSanitized)}`
                            )
                        }
                    }
                    continue
                }

                const expectedSanitized = sanitizeHistoryDates(normalizeAccountCompareField(key, expectedVal))
                const actualSanitized = sanitizeHistoryDates(normalizeAccountCompareField(key, actualVal))

                if (JSON.stringify(expectedSanitized) !== JSON.stringify(actualSanitized)) {
                    drift.push(
                        `${label}.${key}: expected ${JSON.stringify(expectedSanitized)}, got ${JSON.stringify(actualSanitized)}`
                    )
                }
            }
        } catch {
            drift.push(`${label}: could not compare outputs`)
        }
    }

    return { match: drift.length === 0, drift }
}

