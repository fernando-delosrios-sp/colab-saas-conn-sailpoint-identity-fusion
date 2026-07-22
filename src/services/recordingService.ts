import * as fs from 'fs'
import * as path from 'path'
import { LogService } from './logService'
import { FusionRun } from '../model/fusionRun'
import { FusionConfig } from '../model/config'

function sanitizeForJson(value: unknown): unknown {
    if (value === undefined || value === null) return value
    return JSON.parse(JSON.stringify(value))
}

interface RecordedStep {
    stepId: string
    operation: string
    sweep?: number
    input: unknown
    output: unknown[]
    stateAfter: any
    timestamp: string
    duration: number
}

export class RecordingService {
    private static instance?: RecordingService

    private readonly chainName: string
    private readonly recordingDir: string
    private readonly steps: RecordedStep[] = []
    private currentStep: RecordedStep | null = null
    private stepIndex = 0
    private finalized = false

    private constructor(
        private readonly log: LogService,
        private readonly config: FusionConfig
    ) {
        const recConfig = config.recording
        this.chainName = recConfig?.chainName ?? `recording-${Date.now()}`
        this.recordingDir = path.resolve('test-data', 'recordings', this.chainName)
        this.log.info(`RecordingService initialized — chain "${this.chainName}"`)

        this.reloadSteps()

        process.on('SIGINT', async () => {
            await this.finalize()
            process.exit(0)
        })
        process.on('SIGTERM', async () => {
            await this.finalize()
            process.exit(0)
        })
    }

    private reloadSteps(): void {
        const stepsFile = path.join(this.recordingDir, 'steps.ndjson')
        if (!fs.existsSync(stepsFile)) return

        try {
            const content = fs.readFileSync(stepsFile, 'utf-8').trim()
            if (!content) return
            for (const line of content.split('\n')) {
                if (!line) continue
                const step = JSON.parse(line) as RecordedStep
                this.steps.push(step)
                const match = step.stepId.match(/^step-(\d+)$/)
                if (match) {
                    const num = parseInt(match[1], 10)
                    if (num > this.stepIndex) this.stepIndex = num
                }
            }
            this.log.info(`Reloaded ${this.steps.length} previously-recorded step(s) from ${stepsFile}`)
        } catch (err) {
            this.log.warn(`Failed to reload steps from ${stepsFile}: ${err}`)
        }
    }

    private persistStep(step: RecordedStep): void {
        fs.mkdirSync(this.recordingDir, { recursive: true })
        const stepsFile = path.join(this.recordingDir, 'steps.ndjson')
        fs.appendFileSync(stepsFile, JSON.stringify(step) + '\n')
    }

    static init(log: LogService, config: FusionConfig): RecordingService {
        if (!RecordingService.instance) {
            RecordingService.instance = new RecordingService(log, config)
        }
        return RecordingService.instance
    }

    static getInstance(): RecordingService | undefined {
        return RecordingService.instance
    }

    getName(): string {
        return this.chainName
    }

    getStepCount(): number {
        return this.steps.length
    }

    getSteps(): RecordedStep[] {
        return [...this.steps]
    }

    startOperation(
        operation: string,
        input: unknown,
        res: { send: (value: unknown) => void },
        run: FusionRun
    ): void {
        this.stepIndex++
        this.currentStep = {
            stepId: `step-${this.stepIndex}`,
            operation,
            sweep: operation === 'accountList' ? this.stepIndex : undefined,
            input: sanitizeForJson(input),
            output: [],
            stateAfter: run.snapshot() as any,
            timestamp: new Date().toISOString(),
            duration: 0,
        }

        const originalSend = res.send.bind(res)
        res.send = (value: unknown) => {
            this.currentStep?.output.push(sanitizeForJson(value))
            originalSend(value)
        }

        this.log.debug(`Recording step ${this.stepIndex}: ${operation}`)
        if (this.config.recording?.verbose === true) {
            const sweepInfo = this.currentStep.sweep ? ` (sweep ${this.currentStep.sweep})` : ''
            console.log(`[Recording] → ${operation}${sweepInfo} started`)
        }
    }

    endOperation(run: FusionRun): void {
        if (!this.currentStep) return

        this.currentStep.stateAfter = run.snapshot() as any
        this.currentStep.duration = Date.now() - new Date(this.currentStep.timestamp).getTime()
        this.steps.push({ ...this.currentStep })
        this.persistStep(this.currentStep)

        this.log.debug(
            `Recorded step ${this.currentStep.stepId} — ${this.currentStep.output.length} output(s), ${this.currentStep.duration}ms`
        )
        if (this.config.recording?.verbose === true) {
            const sweepInfo = this.currentStep.sweep ? ` (sweep ${this.currentStep.sweep})` : ''
            console.log(`[Recording] ← ${this.currentStep.operation}${sweepInfo} completed — ${this.currentStep.duration}ms, ${this.currentStep.output.length} outputs`)
        }
        this.currentStep = null
    }



    async finalize(): Promise<string> {
        if (this.finalized) return ''
        this.finalized = true

        const dir = path.resolve('test-data', 'recordings', this.chainName)
        fs.mkdirSync(dir, { recursive: true })

        const scenario = this.buildScenario()
        const filePath = path.join(dir, 'scenario.json')
        fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2) + '\n')

        const stepsFile = path.join(dir, 'steps.ndjson')
        try {
            fs.unlinkSync(stepsFile)
        } catch {
            /* best-effort */
        }

        this.log.info(`Recording "${this.chainName}" finalized — ${this.steps.length} steps → ${filePath}`)
        return filePath
    }

    private buildScenario(): Record<string, unknown> {
        const firstStep = this.steps[0]
        const firstState = firstStep?.stateAfter
        const initialState = firstState
            ? {
                  identities: firstState.identities,
                  managedAccounts: firstState.managedAccounts,
                  fusionAccounts: firstState.fusionAccounts,
                  fusionIdentityDecisions: firstState.fusionIdentityDecisions,
              }
            : {
                  identities: [],
                  managedAccounts: [],
                  fusionAccounts: [],
                  fusionIdentityDecisions: [],
              }

        const scenarioSteps = this.steps.map((step) => ({
            id: step.stepId,
            operation: step.operation,
            sweep: step.sweep,
            description: `Recorded ${step.operation} — ${step.duration}ms, ${step.output.length} outputs`,
            input: step.input as Record<string, unknown>,
            expectedOutput:
                step.output.length > 0 ? (step.output.length === 1 ? step.output[0] : step.output) : undefined,
            expectedStateDelta: step.stateAfter,
        }))

        const referenceValues: Record<string, Record<string, unknown>> = {}
        for (const step of this.steps) {
            referenceValues[step.stepId] = {
                outputCount: step.output.length,
                durationMs: step.duration,
                managedAccountsCount: step.stateAfter.managedAccounts.length,
                fusionAccountsCount: step.stateAfter.fusionAccounts.length,
                identitiesCount: step.stateAfter.identities.length,
                fusionIdentityDecisionsCount: step.stateAfter.fusionIdentityDecisions.length,
            }
        }

        return {
            version: '1.0.0',
            recordedAt: new Date().toISOString(),
            chainName: this.chainName,
            config: sanitizeForJson(this.config),
            initialState,
            steps: scenarioSteps,
            referenceValues,
        }
    }
}
