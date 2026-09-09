import { readSettings } from '../matchingSettings'
import { bootstrapLog } from '../../../../services/logService'

describe('matchingSettings readSettings', () => {
    it('defaults fusionEnableManualReview to true when omitted', () => {
        const raw = { matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }] }

        const result = readSettings(raw)

        expect(result.fusionEnableManualReview).toBe(true)
    })

    it('defaults fusionEnableAutoMerge to false when omitted', () => {
        const raw = { matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }] }

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(false)
    })

    it('normalizes string "true" to boolean true for fusionEnableAutoMerge', () => {
        const raw = {
            fusionEnableAutoMerge: 'true' as unknown as boolean,
            fusionAutoMergeScore: 100,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(true)
    })

    it('normalizes string "false" to boolean false for fusionEnableAutoMerge', () => {
        const raw = {
            fusionEnableAutoMerge: 'false' as unknown as boolean,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        } 

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(false)
    })

    it('migrates legacy fusionEnableAutoAssignment to fusionEnableAutoMerge', () => {
        const raw = {
            fusionEnableAutoAssignment: true,
            fusionAutoAssignmentScore: 95,
            fusionManualReviewScore: 80,
            matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }],
        }

        const result = readSettings(raw)

        expect(result.fusionEnableAutoMerge).toBe(true)
        expect(result.fusionAutoMergeScore).toBe(95)
    })

    describe('empty attribute match guard', () => {
        let warn: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            warn = vi.spyOn(bootstrapLog, 'warn').mockImplementation(() => undefined)
        })

        afterEach(() => {
            warn.mockRestore()
        })

        it('warns when matching is enabled but no attribute matches are configured', () => {
            readSettings({ matchingConfigs: [] })

            expect(warn).toHaveBeenCalledTimes(1)
            expect(warn.mock.calls[0][0]).toContain('No Fusion attribute matches are configured')
        })

        it('warns when rules exist but none carry a score threshold', () => {
            readSettings({ matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher' }] })

            expect(warn).toHaveBeenCalledTimes(1)
        })

        it('stays quiet when attribute matches are configured', () => {
            readSettings({
                matchingConfigs: [{ attribute: 'name', algorithm: 'name-matcher', fusionScore: 70 }],
            })

            expect(warn).not.toHaveBeenCalled()
        })

        it('stays quiet when both auto merge and manual review are disabled', () => {
            readSettings({ matchingConfigs: [], fusionEnableManualReview: false })

            expect(warn).not.toHaveBeenCalled()
        })
    })
})
