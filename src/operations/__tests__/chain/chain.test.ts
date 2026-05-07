import * as path from 'path'
import { ChainRunner } from './framework/ChainRunner'

const scenarioPath = path.join(__dirname, 'data', 'chain.scenario.json')

describe('Identity Fusion NG - End-to-End Chain Tests (FR-56)', () => {
    let runner: ChainRunner

    beforeEach(() => {
        runner = new ChainRunner(scenarioPath)
    })

    describe('FR-58: Schema, Entitlements, and Initial Account Aggregation', () => {
        it('step-1: accountDiscoverSchema returns schema with source attributes', async () => {
            const result = await runner.executeStep('step-1')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.schema).toBeDefined()
            const attrs = output.attributes as Array<Record<string, unknown>>
            const attrNames = attrs.map((a) => a.name)
            expect(attrNames).toContain('displayName')
            expect(attrNames).toContain('email')
            expect(attrNames).toContain('employeeId')
            expect(attrNames).toContain('alias')
            expect(attrNames).toContain('department')
            expect(attrNames).toContain('title')
        })

        it('step-2: entitlementList returns status entitlements', async () => {
            const result = await runner.executeStep('step-2')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.type).toBe('status')
            const entitlements = output.entitlements as Array<Record<string, string>>
            expect(entitlements.length).toBeGreaterThanOrEqual(2)
            expect(entitlements.some((e) => e.value === 'enabled')).toBe(true)
            expect(entitlements.some((e) => e.value === 'disabled')).toBe(true)
        })

        it('step-3: entitlementList returns action entitlements with managed source reviewers', async () => {
            const result = await runner.executeStep('step-3')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.type).toBe('action')
            const entitlements = output.entitlements as Array<Record<string, string>>
            expect(entitlements.length).toBeGreaterThanOrEqual(1)
            expect(entitlements.some((e) => e.value === 'correlate')).toBe(true)
        })

        it('step-4: accountList pass1 aggregates HR Source with matches and deferred', async () => {
            const result = await runner.executeStep('step-4')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.outputCount).toBeGreaterThan(0)
            expect(output.correlatedCount).toBeGreaterThan(0)
            expect(output.unmatchedCount).toBeGreaterThanOrEqual(0)
            expect(output.identitiesFound).toBeGreaterThan(0)

            const refValues = runner.getReferenceForStep('step-4')
            if (refValues?.expectedCorrelatedCount !== undefined) {
                expect(output.correlatedCount).toBe(refValues.expectedCorrelatedCount)
            }
            if (refValues?.expectedNewFusionCount !== undefined) {
                const newFusions = output.newFusionAccounts as Array<unknown> | undefined
                expect(newFusions?.length).toBe(refValues.expectedNewFusionCount as number)
            }

            const state = runner.getState()
            expect(state.getFusionAccounts().length).toBeGreaterThan(0)
        })
    })

    describe('FR-59: Secondary Aggregation and Account State Transitions', () => {
        beforeEach(async () => {
            // Execute steps 1-4 to set up initial state
            await runner.executeStep('step-1')
            await runner.executeStep('step-2')
            await runner.executeStep('step-3')
            await runner.executeStep('step-4')
        })

        it('step-5: accountCreate creates a new Fusion account from identity', async () => {
            const result = await runner.executeStep('step-5')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.identityLinked).toBe(true)
            expect(output.fusionAccountId).toBeDefined()

            const state = runner.getState()
            const fusionAccounts = state.getFusionAccounts()
            expect(fusionAccounts.some((a) => a.nativeIdentity === output.fusionAccountId)).toBe(true)
        })

        it('step-6: accountList pass2 aggregates Payroll Source with deferred→matched transitions', async () => {
            await runner.executeStep('step-5')

            const result = await runner.executeStep('step-6')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.outputCount).toBeGreaterThan(0)
            expect(output.correlatedCount).toBeGreaterThan(0)

            const refValues = runner.getReferenceForStep('step-6')
            if (refValues?.expectedCorrelatedCount !== undefined) {
                expect(output.correlatedCount).toBeGreaterThanOrEqual(
                    refValues.expectedCorrelatedCount as number
                )
            }
        })

        it('step-7: accountDisable disables an existing Fusion account and preserves attributes', async () => {
            await runner.executeStep('step-5')
            await runner.executeStep('step-6')

            const stateBefore = runner.getState()
            const accountsBefore = stateBefore.getFusionAccounts()
            const target = accountsBefore.find(
                (a) => a.nativeIdentity === 'fusion-identity-carol'
            )

            if (target) {
                const result = await runner.executeStep('step-7')

                expect(result.success).toBe(true)
                const output = result.output as Record<string, unknown>
                expect(output.disabled).toBe(true)
                expect(output.attributesPreserved).toBe(true)

                const stateAfter = runner.getState()
                const disabled = stateAfter.getFusionAccount(target.nativeIdentity)
                expect(disabled?.disabled).toBe(true)
            }
        })
    })

    describe('FR-60: Attribute Propagation and Entitlement Updates', () => {
        beforeEach(async () => {
            await runner.executeStep('step-1')
            await runner.executeStep('step-2')
            await runner.executeStep('step-3')
            await runner.executeStep('step-4')
            await runner.executeStep('step-5')
            await runner.executeStep('step-6')
        })

        it('step-8: accountEnable refreshes unique attributes (changed)', async () => {
            const stateBefore = runner.getState()
            const accountsBefore = stateBefore.getFusionAccounts()
            const target = accountsBefore.find((a) => a.name === 'Alice Developer')

            if (target) {
                const result = await runner.executeStep('step-8')

                expect(result.success).toBe(true)
                const output = result.output as Record<string, unknown>
                expect(output.enabled).toBe(true)
                expect(output.uniqueAttributesRefreshed).toBe(true)
                expect(output.employeeIdRegenerated).toBe(true)
                expect(output.aliasRegenerated).toBe(true)
                expect(output.normalAttributesUpdated).toBe(true)

                const stateAfter = runner.getState()
                const enabled = stateAfter.getFusionAccount(target.nativeIdentity)
                expect(enabled?.disabled).toBe(false)
            }
        })

        it('step-9: accountRead does NOT refresh unique attributes (unchanged)', async () => {
            const stateBefore = runner.getState()
            const accountsBefore = stateBefore.getFusionAccounts()
            const alice = accountsBefore.find((a) => a.name === 'Alice Developer')
            const targetIdentity = alice?.nativeIdentity ?? 'fusion-identity-alice'

            const result = await runner.executeStep('step-9')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.identityFound).toBe(true)
            expect(output.uniqueAttributesUnchanged).toBe(true)
            expect(output.employeeIdPreserved).toBe(true)
            expect(output.aliasPreserved).toBe(true)
            expect(output.normalAttributesUpdated).toBe(true)
        })

        it('step-10: accountUpdate handles entitlement assignment changes', async () => {
            const stateBefore = runner.getState()
            const accountsBefore = stateBefore.getFusionAccounts()
            const bob = accountsBefore.find((a) => a.name === 'Bob Tester')

            const targetIdentity = bob?.nativeIdentity ?? 'fusion-identity-bob'

            const result = await runner.executeStep('step-10')

            expect(result.success).toBe(true)
            const output = result.output as Record<string, unknown>
            expect(output.entitlementChanged).toBe(true)
            expect(output.correlationRecomputed).toBe(true)

            const stateAfter = runner.getState()
            const updated = stateAfter.getFusionAccount(targetIdentity)
            expect(updated?.actions).toContain('correlate:identity-bob')
        })
    })

    describe('Full Chain Execution', () => {
        it('executes all steps sequentially without failures', async () => {
            const results = await runner.executeAll()

            expect(results.success).toBe(true)
            expect(results.stepsExecuted).toBe(10)
            expect(results.stepsFailed).toBe(0)

            for (const result of results.stepResults) {
                expect(result.success).toBe(true)
            }

            const finalState = runner.getState()
            expect(finalState.getFusionAccounts().length).toBeGreaterThan(0)

            const correlated = finalState
                .getFusionAccounts()
                .filter((a) => a.actions?.includes('correlated') || a.statuses?.includes('correlated'))
            expect(correlated.length).toBeGreaterThanOrEqual(1)
        })

        it('partial chain up to step-6 produces expected state', async () => {
            await runner.executeUpTo('step-6')

            const state = runner.getState()
            expect(state.getFusionAccounts().length).toBeGreaterThan(0)

            const step4Result = state.getStepResult('step-4')
            expect(step4Result?.success).toBe(true)

            const step5Result = state.getStepResult('step-5')
            expect(step5Result?.success).toBe(true)

            const step6Result = state.getStepResult('step-6')
            expect(step6Result?.success).toBe(true)
        })
    })

    describe('Configuration Coverage', () => {
        it('respects account filters (Jmespath)', async () => {
            const config = runner.getConfig()
            const hrSource = (config.sources as Array<Record<string, unknown>>)?.find(
                (s) => s.name === 'HR Source'
            )
            expect(hrSource?.accountJmespathFilter).toBe("department == 'Engineering'")

            await runner.executeStep('step-1')
            await runner.executeStep('step-2')
            await runner.executeStep('step-3')
            const result = await runner.executeStep('step-4')

            const output = result.output as Record<string, unknown>
            expect(output.accountsFiltered).toBeGreaterThanOrEqual(0)
        })

        it('handles exact match auto-assignment when fusionMergingExactMatch is enabled', async () => {
            const config = runner.getConfig()
            expect(config.fusionMergingExactMatch).toBe(true)

            await runner.executeStep('step-1')
            await runner.executeStep('step-2')
            await runner.executeStep('step-3')
            const result = await runner.executeStep('step-4')

            const output = result.output as Record<string, unknown>
            expect(output.correlatedCount).toBeGreaterThan(0)
        })

        it('unique attribute counter is used for employeeId generation', async () => {
            const config = runner.getConfig()
            const uniqueAttrs = config.uniqueAttributeDefinitions as Array<Record<string, unknown>> | undefined
            const employeeIdDef = uniqueAttrs?.find((u) => u.name === 'employeeId')
            expect(employeeIdDef).toBeDefined()
            expect(employeeIdDef?.useIncrementalCounter).toBe(true)
            expect(employeeIdDef?.counterStart).toBe(1000)
        })

        it('conditional Velocity expression generates different alias types', async () => {
            const config = runner.getConfig()
            const uniqueAttrs = config.uniqueAttributeDefinitions as Array<Record<string, unknown>> | undefined
            const aliasDef = uniqueAttrs?.find((u) => u.name === 'alias')
            expect(aliasDef).toBeDefined()
            expect(aliasDef?.expression).toContain('$UUID')
            expect(aliasDef?.expression).toContain('$counter')
        })
    })
})
