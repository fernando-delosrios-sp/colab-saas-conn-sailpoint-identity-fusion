import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'node:module'
import { writePassingScenario } from './fixtures/minimalRecordingFixture'

const require = createRequire(import.meta.url)
const {
    buildStepCommand,
    parseNdjsonResponse,
    runScenarioReplay,
    validateScenarioDir,
    writeReplayReport,
} = require('../../../../scripts/lib/scenario-replay-lib.cjs')

describe('scenario replay orchestrator', () => {
    let tempDir: string
    let scenarioRef: string

    beforeEach(() => {
        const scenarioName = `fixture-${Date.now()}`
        scenarioRef = `orchestrator-test/${scenarioName}`
        tempDir = path.join(process.cwd(), 'recordings', 'orchestrator-test', scenarioName)
        fs.mkdirSync(tempDir, { recursive: true })
        writePassingScenario(tempDir, { chainName: scenarioName })
        fs.writeFileSync(
            path.join(tempDir, 'api-log.ndjson'),
            JSON.stringify({
                api: 'sources',
                method: 'listSources',
                args: [{}],
                response: [],
                timestamp: '2026-01-01T00:00:00.000Z',
            }) + '\n'
        )
    })

    afterEach(() => {
        const tenantDir = path.join(process.cwd(), 'recordings', 'orchestrator-test')
        if (fs.existsSync(tenantDir)) {
            fs.rmSync(tenantDir, { recursive: true, force: true })
        }
    })

    it('validateScenarioDir loads scenario.json and api-log', () => {
        const { scenario, scenarioRef: ref } = validateScenarioDir(scenarioRef)
        expect(ref).toBe(scenarioRef)
        expect(scenario.steps).toHaveLength(1)
        expect(scenario.steps[0].operation).toBe('entitlementList')
    })

    it('buildStepCommand maps operation to SDK type and replay recording config', () => {
        const { scenario } = validateScenarioDir(scenarioRef)
        const command = buildStepCommand(scenario.steps[0], scenario, scenarioRef)
        expect(command.type).toBe('std:entitlement:list')
        expect(command.input).toEqual({ type: 'status' })
        expect(command.config.recording?.mode).toBe('replay')
        expect(command.config.recording?.scenarioName).toBe(scenarioRef)
    })

    it('parseNdjsonResponse collects connector output lines', () => {
        const outputs = parseNdjsonResponse('{"attributes":{"id":"a"}}\n\n{"attributes":{"id":"b"}}\n')
        expect(outputs).toHaveLength(2)
    })

    it('runScenarioReplay succeeds with mocked HTTP and writes replay-report.json', async () => {
        const postStep = vi.fn(async () => [{ attributes: { type: 'status' } }])
        const spawnProxy = vi.fn(() => ({ killed: false, kill: vi.fn() }))
        const waitForPort = vi.fn(async () => {})

        const { failed, reportPath } = await runScenarioReplay({
            scenarioRef,
            flags: { noVerify: true },
            postStep,
            spawnProxy,
            waitForPort,
            log: () => {},
        })

        expect(failed).toBe(false)
        expect(postStep).toHaveBeenCalledTimes(1)
        expect(spawnProxy).toHaveBeenCalledTimes(1)
        expect(fs.existsSync(reportPath)).toBe(true)
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
        expect(report.success).toBe(true)
        expect(report.stepResults).toHaveLength(1)
    })

    it('runScenarioReplay exits with drift when golden comparison fails', async () => {
        const postStep = vi.fn(async () => [{ attributes: { id: 'actual' } }])
        const spawnProxy = vi.fn(() => ({ killed: false, kill: vi.fn() }))
        const waitForPort = vi.fn(async () => {})

        const scenarioPath = path.join(tempDir, 'scenario.json')
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'))
        scenario.steps[0].expectedOutput = { attributes: { id: 'expected' } }
        fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + '\n')

        const { failed, report } = await runScenarioReplay({
            scenarioRef,
            postStep,
            spawnProxy,
            waitForPort,
            log: () => {},
        })

        expect(failed).toBe(true)
        expect(report.stepsFailed).toBe(1)
        expect(report.stepResults[0].drift.length).toBeGreaterThan(0)
    })

    it('runScenarioReplay --step runs only the requested step', async () => {
        const scenarioPath = path.join(tempDir, 'scenario.json')
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'))
        scenario.steps.push({
            id: 'step-2',
            operation: 'entitlementList',
            input: { type: 'status' },
        })
        fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + '\n')

        const postStep = vi.fn(async () => [])
        const spawnProxy = vi.fn(() => ({ killed: false, kill: vi.fn() }))
        const waitForPort = vi.fn(async () => {})

        const { failed, report } = await runScenarioReplay({
            scenarioRef,
            flags: { step: 'step-2' },
            postStep,
            spawnProxy,
            waitForPort,
            log: () => {},
        })

        expect(failed).toBe(false)
        expect(postStep).toHaveBeenCalledTimes(1)
        expect(report.stepResults).toHaveLength(1)
        expect(report.stepResults[0].stepId).toBe('step-2')
        expect(report.flags.step).toBe('step-2')
    })

    it('writeReplayReport persists per-step results', () => {
        const reportPath = writeReplayReport(tempDir, {
            version: '1.0.0',
            success: true,
            stepResults: [{ stepId: 'step-1', success: true, drift: [] }],
        })
        const saved = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
        expect(saved.stepResults[0].stepId).toBe('step-1')
    })
})
