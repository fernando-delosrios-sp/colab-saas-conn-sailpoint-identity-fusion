import { AttributeMergeMode } from '../../../../model/config'
import { connectorSpecInitialValues, readSettings, runtimeDefaults } from '../attributeMappingDefinitionsSettings'

describe('attributeMappingDefinitionsSettings readSettings', () => {
    it('uses Main account merge when attributeMerge is missing', () => {
        expect(readSettings({}).attributeMerge).toBe(AttributeMergeMode.MainAccount)
        expect(connectorSpecInitialValues.attributeMerge).toBe(AttributeMergeMode.MainAccount)
        expect(runtimeDefaults.attributeMerge).toBe(AttributeMergeMode.MainAccount)
    })

    it('preserves a stored First found merge strategy', () => {
        expect(readSettings({ attributeMerge: AttributeMergeMode.First }).attributeMerge).toBe(AttributeMergeMode.First)
    })

    it('uses First found for an unknown persisted merge strategy', () => {
        expect(readSettings({ attributeMerge: 'future-mode' }).attributeMerge).toBe(AttributeMergeMode.First)
    })
})
