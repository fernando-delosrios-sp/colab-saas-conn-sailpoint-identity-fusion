import * as path from 'path'
import { ChainRunner, registerStepFn } from './framework/ChainRunner'
import { buildReplayContext, collectOutputs } from './harness/ReplayAdapter'
import { accountList } from '../../../operations/accountList'
import { MockRegistry } from './framework/ChainContext'
import { recordingChainDir } from '../../../data/recordingPaths'

const exploreChain = process.env.EXPLORE_RECORDING_CHAIN?.trim()
const baseurl = process.env.BASEURL

describe.skipIf(!exploreChain)('Run and Inspect Step-1 Output', () => {
    beforeAll(() => {
        registerStepFn('accountList', async (step, context) => {
            const replayCtx = buildReplayContext(step, context)
            const registry = replayCtx.registry as unknown as MockRegistry
            context.state.setSweepIndex(step.sweep ?? 1)
            await accountList(registry as any, (step.input ?? { schema: { attributes: [] } }) as any)
            return {
                operation: step.operation,
                sweep: step.sweep,
                outputs: collectOutputs(replayCtx),
            }
        })
    })

    it(`runs step-1 and prints output for chain: ${exploreChain}`, async () => {
        const scenarioPath = path.join(recordingChainDir(exploreChain!, baseurl), 'scenario.json')
        const runner = new ChainRunner(scenarioPath)
        const result = await runner.executeStep('step-1')

        expect(result.success).toBe(true)
        const output: any = result.output
        const outputs = output.outputs || []
        console.log('Total outputs in step-1:', outputs.length)

        const targetAccount = outputs.find(
            (o: any) => o.key?.simple?.id === 'NG000023' || o.attributes?.id === 'NG000023'
        )
        if (targetAccount) {
            console.log('ACTUAL ACCOUNT NG000023:', JSON.stringify(targetAccount, null, 2))
        } else {
            console.log(
                'NG000023 not found in ACTUAL outputs. Available IDs:',
                outputs.map((o: any) => o.key?.simple?.id || o.attributes?.id)
            )
        }
    })
})

