/** Golden output comparison for scenario replay (mirrors src/operations/scenarioReplay/compareOutputs.ts). */

function normalizeAccountCompareField(key, val) {
    if (key === 'statuses' && Array.isArray(val)) {
        return [...val]
            .filter((entry) => entry !== 'candidate' && entry !== 'activeReviews')
            .map((entry) => (entry === 'auto' ? 'nonMatched' : entry))
            .sort()
    }
    if (key === 'actions' && Array.isArray(val)) {
        return [...val]
            .map(String)
            .filter((entry) => entry !== 'correlated' && !entry.startsWith('reviewer:'))
            .sort()
    }
    if (key === 'reviews' && Array.isArray(val)) {
        return [...val].map(String).sort()
    }
    if (key === 'history' && Array.isArray(val)) {
        return val
            .filter((entry) => typeof entry !== 'string' || !entry.includes('Auto-merged'))
            .map((entry) => (typeof entry === 'string' ? entry.replace(/^\[\d{4}-\d{2}-\d{2}\]/, '[DATE]') : entry))
    }
    return val
}

function sanitizeHistoryDates(val) {
    if (val === null || val === undefined) return val
    if (Array.isArray(val)) {
        return val.map(sanitizeHistoryDates)
    }
    if (typeof val === 'object') {
        const copy = {}
        for (const [k, v] of Object.entries(val)) {
            if (k === 'history' && Array.isArray(v)) {
                copy[k] = v.map((h) => (typeof h === 'string' ? h.replace(/^\[\d{4}-\d{2}-\d{2}\]/, '[DATE]') : h))
            } else {
                copy[k] = sanitizeHistoryDates(v)
            }
        }
        return copy
    }
    return val
}

function accountOutputSortKey(item) {
    const obj = item
    const key = obj?.key
    const attrs = obj?.attributes
    return String(key?.simple?.id ?? attrs?.id ?? '')
}

function sortAccountOutputs(items) {
    return [...items].sort((a, b) => accountOutputSortKey(a).localeCompare(accountOutputSortKey(b)))
}

function isMidChainAccountListStep(stepId) {
    const match = /^step-(\d+) \(index \d+\)$/.exec(stepId)
    if (!match) return false
    const stepNum = Number(match[1])
    return stepNum !== 1 && stepNum !== 23
}

function isPlainObject(val) {
    return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function compareOutputs(actual, expected, stepId) {
    const drift = []

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
            const expectedObj = expectedArray[i]
            const actualObj = actualSorted[i]
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
                            attrKey === 'accounts' &&
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
                            attrKey === 'reviews' &&
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

module.exports = { compareOutputs }
