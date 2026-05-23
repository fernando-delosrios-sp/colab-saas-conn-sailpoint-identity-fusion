import * as fs from 'fs';
import * as path from 'path';
import { ChainRunner, registerStepFn } from './framework/ChainRunner';
import { buildReplayContext, collectOutputs } from './harness/ReplayAdapter';
import { accountList } from '../../../operations/accountList';
import { MockRegistry } from './framework/ChainContext';

describe('Run and Inspect Step-1 Output', () => {
    it('runs step-1 and prints actual output for NG000023', async () => {
        // Register the step function as done in chain.replay.test.ts
        registerStepFn('accountList', async (step, context) => {
            const replayCtx = buildReplayContext(step, context);
            const registry = replayCtx.registry as unknown as MockRegistry;
            context.state.setPassIndex(step.pass ?? 1);
            await accountList(registry as any, (step.input ?? { schema: { attributes: [] } }) as any);
            return {
                operation: step.operation,
                pass: step.pass,
                outputs: collectOutputs(replayCtx),
            };
        });

        const scenarioPath = path.resolve('test-data/recordings/fernando/scenario.json');
        const runner = new ChainRunner(scenarioPath);
        const result = await runner.executeStep('step-1');

        expect(result.success).toBe(true);
        const output: any = result.output;
        const outputs = output.outputs || [];
        console.log('Total outputs in step-1:', outputs.length);

        const targetAccount = outputs.find((o: any) => o.key?.simple?.id === 'NG000023' || o.attributes?.id === 'NG000023');
        if (targetAccount) {
            console.log('ACTUAL ACCOUNT NG000023:', JSON.stringify(targetAccount, null, 2));
        } else {
            console.log('NG000023 not found in ACTUAL outputs. Available IDs:', outputs.map((o: any) => o.key?.simple?.id || o.attributes?.id));
        }
    });
});
