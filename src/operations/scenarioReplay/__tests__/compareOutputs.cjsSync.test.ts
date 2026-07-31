import { createRequire } from 'node:module'
import { compareOutputs as tsCompareOutputs } from '../compareOutputs'

const require = createRequire(import.meta.url)
const { compareOutputs: cjsCompareOutputs } = require('../../../../scripts/scenario-replay-compare.cjs')

/** Keeps scripts/scenario-replay-compare.cjs aligned with the TypeScript source of truth. */
describe('compareOutputs CJS mirror', () => {
    const cases: Array<{ actual: unknown[]; expected: unknown; stepId: string }> = [
        { actual: [], expected: null, stepId: 'step-1' },
        { actual: [], expected: undefined, stepId: 'step-1' },
        { actual: [], expected: { attributes: { id: 'a' } }, stepId: 'step-1' },
        {
            actual: [{ attributes: { id: 'changed' } }],
            expected: { attributes: { id: 'original' } },
            stepId: 'step-2',
        },
        {
            actual: [
                { key: { simple: { id: 'b' } }, attributes: { id: 'b' } },
                { key: { simple: { id: 'a' } }, attributes: { id: 'a' } },
            ],
            expected: [
                { key: { simple: { id: 'a' } }, attributes: { id: 'a' } },
                { key: { simple: { id: 'b' } }, attributes: { id: 'b' } },
            ],
            stepId: 'step-3',
        },
    ]

    it.each(cases)('matches TS compareOutputs for $stepId', ({ actual, expected, stepId }) => {
        expect(cjsCompareOutputs(actual, expected, stepId)).toEqual(tsCompareOutputs(actual, expected, stepId))
    })
})
