import * as fs from 'fs'
import * as path from 'path'
import { LogService } from './logService'
import { SourceService } from './sourceService'
import { IdentityService } from './identityService'
import { FormService } from './formService'
import { FusionConfig } from '../model/config'

function sanitizeForJson(value: unknown): unknown {
    if (value === undefined || value === null) return value
    return JSON.parse(JSON.stringify(value))
}

interface StateSnapshot {
    identities: unknown[]
    managedAccounts: unknown[]
    fusionAccounts: unknown[]
    formDecisions: unknown[]
}

interface RecordedStep {
    stepId: string
    operation: string
    pass?: number
    input: unknown
    output: unknown[]
    stateAfter: StateSnapshot
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
        this.chainName = process.env.RECORD_CHAIN_NAME ?? `recording-${Date.now()}`
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
        sources: SourceService,
        identities: IdentityService,
        forms: FormService
    ): void {
        this.stepIndex++
        this.currentStep = {
            stepId: `step-${this.stepIndex}`,
            operation,
            pass: operation === 'accountList' ? this.stepIndex : undefined,
            input: sanitizeForJson(input),
            output: [],
            stateAfter: this.snapshotState(sources, identities, forms),
            timestamp: new Date().toISOString(),
            duration: 0,
        }

        const originalSend = res.send.bind(res)
        res.send = (value: unknown) => {
            this.currentStep?.output.push(sanitizeForJson(value))
            originalSend(value)
        }

        this.log.debug(`Recording step ${this.stepIndex}: ${operation}`)
        if (process.env.VERBOSE_RECORDING === 'true') {
            const passInfo = this.currentStep.pass ? ` (pass ${this.currentStep.pass})` : ''
            console.log(`[Recording] → ${operation}${passInfo} started`)
        }
    }

    endOperation(sources: SourceService, identities: IdentityService, forms: FormService): void {
        if (!this.currentStep) return

        this.currentStep.stateAfter = this.snapshotState(sources, identities, forms)
        this.currentStep.duration = Date.now() - new Date(this.currentStep.timestamp).getTime()
        this.steps.push({ ...this.currentStep })
        this.persistStep(this.currentStep)

        this.log.debug(
            `Recorded step ${this.currentStep.stepId} — ${this.currentStep.output.length} output(s), ${this.currentStep.duration}ms`
        )
        if (process.env.VERBOSE_RECORDING === 'true') {
            const passInfo = this.currentStep.pass ? ` (pass ${this.currentStep.pass})` : ''
            console.log(`[Recording] ← ${this.currentStep.operation}${passInfo} completed — ${this.currentStep.duration}ms, ${this.currentStep.output.length} outputs`)
        }
        this.currentStep = null
    }

    private snapshotState(sources: SourceService, identities: IdentityService, forms: FormService): StateSnapshot {
        let managedAccounts: unknown[] = []
        if (sources?.managedAccountsAllById) {
            managedAccounts = Array.from(sources.managedAccountsAllById.values()).map((a) => sanitizeForJson(a))
        }

        let fusionAccounts: unknown[] = []
        if (sources?.fusionAccountsByNativeIdentity) {
            fusionAccounts = Array.from(sources.fusionAccountsByNativeIdentity.values()).map((a) => sanitizeForJson(a))
        }

        let identityList: unknown[] = []
        try {
            identityList = Array.from(identities.identityValues()).map((i) => sanitizeForJson(i))
        } catch {
            /* identityValues may not be accessible in all contexts */
        }

        let formDecisions: unknown[] = []
        try {
            formDecisions = forms.fusionIdentityDecisions
        } catch {
            /* may not be accessible */
        }

        return {
            identities: identityList,
            managedAccounts,
            fusionAccounts,
            formDecisions,
        }
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
                  formDecisions: firstState.formDecisions,
              }
            : {
                  identities: [],
                  managedAccounts: [],
                  fusionAccounts: [],
                  formDecisions: [],
              }

        const scenarioSteps = this.steps.map((step) => ({
            id: step.stepId,
            operation: step.operation,
            pass: step.pass,
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
                formDecisionsCount: step.stateAfter.formDecisions.length,
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
