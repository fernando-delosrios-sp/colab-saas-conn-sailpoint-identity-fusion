import { accountUpdate } from '../accountUpdate'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'
import { executeActions } from '../actions'
import { FusionAction } from '../../model/fusionAction'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import type { Mock } from 'vitest'

vi.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: vi.fn(),
}))

vi.mock('../actions', () => ({
    executeActions: vi.fn(),
}))

vi.mock('../helpers/reportPipeline', () => ({
    runReportPipeline: vi.fn(),
}))

import { createTestRegistry } from './harness/testRegistry'
import { runReportPipeline } from '../helpers/reportPipeline'

function createRegistry() {
    const registry = createTestRegistry({
        sourceConfigs: [{ name: 'fusion', correlationMode: 'none' }],
    })

    const sources = registry.sources as any
    sources.fetchAllSources = vi.fn().mockResolvedValue(undefined)
    sources.fetchFusionAccount = vi.fn().mockResolvedValue(undefined)
    sources.fetchFusionAccounts = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(sources, 'fusionAccounts', { value: [], writable: true, configurable: true })
    sources.fusionAccountsByNativeIdentity = new Map()

    const schemas = registry.schemas as any
    schemas.setFusionAccountSchema = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(schemas, 'fusionDisplayAttribute', { value: 'name', writable: true, configurable: true })

    const fusion = registry.fusion as any
    fusion.normalizePendingFormStateForOutput = vi.fn().mockResolvedValue(undefined)
    fusion.getISCAccount = vi.fn().mockResolvedValue({ id: 'isc-updated' })
    fusion.forEachISCAccount = vi.fn()

    const log = registry.log as any
    log.crash = vi.fn()

    return registry
}

function mockCrashThrows(registry: ReturnType<typeof createRegistry>) {
    const log = registry.log as any
    log.crash = vi.fn((message: string) => {
        throw new ConnectorError(message, ConnectorErrorType.Generic)
    })
}

describe('accountUpdate', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('executes action entitlement changes and returns updated account', async () => {
        const registry = createRegistry()
        const fusionAccount = { managedKey: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)

        const input = {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Add', value: 'correlate:id-1' }],
        } as any

        await accountUpdate(registry, input)

        expect(rebuildFusionAccount).toHaveBeenCalledWith(
            'fusion-1',
            expect.any(Object),
            expect.objectContaining({
                fusion: expect.any(Object),
                identities: expect.any(Object),
                sources: expect.any(Object),
                log: expect.any(Object),
            })
        )
        expect(executeActions).toHaveBeenCalledWith(fusionAccount, input.changes[0], registry)
        expect(registry.fusion.normalizePendingFormStateForOutput).not.toHaveBeenCalled()
        expect(registry.fusion.getISCAccount).toHaveBeenCalledWith(fusionAccount, true)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-updated' })
    })

    it('fails when removing correlated action entitlement', async () => {
        const registry = createRegistry()
        mockCrashThrows(registry)
        const { executeActions: realExecuteActions } = await vi.importActual<typeof import('../actions')>(
            '../actions'
        )
        vi.mocked(executeActions).mockImplementation(realExecuteActions)
        ;(rebuildFusionAccount as Mock).mockResolvedValue({ managedKey: 'fusion-1', name: 'Fusion User' })

        await expect(
            accountUpdate(registry, {
                identity: 'fusion-1',
                schema: { attributes: [] },
                changes: [{ attribute: 'actions', op: 'Remove', value: FusionAction.Correlated }],
            } as any)
        ).rejects.toMatchObject({ message: 'Correlated entitlement cannot be removed: correlated' })

        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('fails when removing correlate action token', async () => {
        const registry = createRegistry()
        mockCrashThrows(registry)
        const { executeActions: realExecuteActions } = await vi.importActual<typeof import('../actions')>(
            '../actions'
        )
        vi.mocked(executeActions).mockImplementation(realExecuteActions)
        ;(rebuildFusionAccount as Mock).mockResolvedValue({ managedKey: 'fusion-1', name: 'Fusion User' })

        await expect(
            accountUpdate(registry, {
                identity: 'fusion-1',
                schema: { attributes: [] },
                changes: [{ attribute: 'actions', op: 'Remove', value: 'correlate' }],
            } as any)
        ).rejects.toMatchObject({ message: 'Correlated entitlement cannot be removed: correlate' })

        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('logs crash for unsupported entitlement change attribute', async () => {
        const registry = createRegistry()
        ;(rebuildFusionAccount as Mock).mockResolvedValue({ managedKey: 'fusion-1' })

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'department', op: 'Add', value: 'IT' }],
        } as any)

        expect(registry.log.crash).toHaveBeenCalledWith('Unsupported entitlement change: department')
        expect(executeActions).not.toHaveBeenCalled()
    })

    it('reports a status entitlement request as a provisioning error naming the account and status', async () => {
        const registry = createRegistry()
        const error = vi.spyOn(registry.log, 'error').mockImplementation(() => undefined)
        ;(rebuildFusionAccount as Mock).mockResolvedValue({
            managedKey: '5017dbcd-1cef-4912-a9b4-a5254c9e4fa0',
            name: 'Jane Doe',
        })

        await accountUpdate(registry, {
            identity: '5017dbcd-1cef-4912-a9b4-a5254c9e4fa0',
            schema: { attributes: [] },
            changes: [{ attribute: 'statuses', op: 'Add', value: 'authorized' }],
        } as any)

        const message =
            'Account Jane Doe (5017dbcd-1cef-4912-a9b4-a5254c9e4fa0) cannot change status entitlements (add "authorized"). Status entitlements are assigned by Fusion and are not requestable.'
        expect(registry.log.crash).not.toHaveBeenCalled()
        expect(executeActions).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalledWith(message)
        expect(registry.res.send).toHaveBeenCalledWith({
            id: 'isc-updated',
            results: [
                {
                    attribute: 'statuses',
                    status: 'error',
                    messages: [{ level: 'ERROR', message }],
                },
            ],
        })
    })

    it('names every status in a remove or multi-value status request', async () => {
        const registry = createRegistry()
        const error = vi.spyOn(registry.log, 'error').mockImplementation(() => undefined)
        ;(rebuildFusionAccount as Mock).mockResolvedValue({ managedKey: 'fusion-1' })

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [
                { attribute: 'statuses', op: 'Remove', value: 'orphan' },
                { attribute: 'statuses', op: 'Set', value: ['baseline', 'manual'] },
            ],
        } as any)

        expect(error).toHaveBeenCalledWith(
            'Account fusion-1 cannot change status entitlements (remove "orphan"; set "baseline", "manual"). Status entitlements are assigned by Fusion and are not requestable.'
        )
        expect(registry.log.crash).not.toHaveBeenCalled()
        expect(registry.res.send).toHaveBeenCalled()
    })

    it('still applies action changes when a status entitlement is requested in the same update', async () => {
        const registry = createRegistry()
        vi.mocked(executeActions).mockResolvedValue(undefined)
        const fusionAccount = { managedKey: 'fusion-1', name: 'Fusion User' }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [
                { attribute: 'actions', op: 'Add', value: 'correlate:id-1' },
                { attribute: 'statuses', op: 'Add', value: 'authorized' },
            ],
        } as any)

        expect(executeActions).toHaveBeenCalledWith(
            fusionAccount,
            expect.objectContaining({ attribute: 'actions' }),
            registry
        )
        expect(registry.log.crash).not.toHaveBeenCalled()
        expect(registry.res.send).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'isc-updated',
                results: [
                    expect.objectContaining({
                        attribute: 'statuses',
                        status: 'error',
                    }),
                ],
            })
        )
    })

    it('preserves reverse correlation attributes as-is during account update', async () => {
        const registry = createRegistry()
        registry.config.sources = [
            { name: 'HR', correlationMode: 'reverse', correlationAttribute: 'reverseNativeIdentity' },
        ]
        registry.sources.fusionAccountsByNativeIdentity.set('fusion-1', {
            attributes: {
                reverseNativeIdentity: 'native-before-update',
            },
        })
        const fusionAccount = {
            managedKey: 'fusion-1',
            attributes: {
                reverseNativeIdentity: 'native-after-rebuild',
            } as Record<string, string>,
            setReverseCorrelationAttribute(attributeName: string, value: string) {
                this.attributes[attributeName] = value
            },
            clearReverseCorrelationAttribute(attributeName: string) {
                delete this.attributes[attributeName]
            },
        }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)
        ;(executeActions as Mock).mockImplementation(async (account) => {
            account.attributes.reverseNativeIdentity = 'native-after-action'
        })

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Add', value: 'correlate:id-1' }],
        } as any)

        expect(registry.sources.fetchFusionAccount).toHaveBeenCalledWith('fusion-1', false)
        expect(fusionAccount.attributes.reverseNativeIdentity).toBe('native-before-update')
    })

    it('fails with observable message for unsupported action', async () => {
        const registry = createRegistry()
        mockCrashThrows(registry)
        const { executeActions: realExecuteActions } = await vi.importActual<typeof import('../actions')>(
            '../actions'
        )
        vi.mocked(executeActions).mockImplementation(realExecuteActions)
        ;(rebuildFusionAccount as Mock).mockResolvedValue({ managedKey: 'fusion-1', name: 'Fusion User' })

        await expect(
            accountUpdate(registry, {
                identity: 'fusion-1',
                schema: { attributes: [] },
                changes: [{ attribute: 'actions', op: 'Add', value: 'unknown-action' }],
            } as any)
        ).rejects.toMatchObject({ message: 'Unsupported action: unknown-action' })

        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('fails with observable message when fusion account is not found', async () => {
        const registry = createRegistry()
        mockCrashThrows(registry)
        ;(rebuildFusionAccount as Mock).mockResolvedValue(undefined)

        await expect(
            accountUpdate(registry, {
                identity: 'missing-fusion',
                schema: { attributes: [] },
                changes: [{ attribute: 'actions', op: 'Add', value: 'correlate:id-1' }],
            } as any)
        ).rejects.toMatchObject({ message: 'Fusion account not found for identity: missing-fusion' })

        expect(registry.res.send).not.toHaveBeenCalled()
    })

    it('dispatches Fusion report pipeline on report Add without streaming extra StdAccountListOutput objects', async () => {
        const registry = createRegistry()
        const { executeActions: realExecuteActions } = await vi.importActual<typeof import('../actions')>(
            '../actions'
        )
        vi.mocked(executeActions).mockImplementation(realExecuteActions)
        vi.mocked(runReportPipeline).mockResolvedValue(undefined)
        ;(rebuildFusionAccount as Mock).mockResolvedValue({ managedKey: 'fusion-1', name: 'Fusion User' })

        await accountUpdate(registry, {
            identity: 'fusion-1',
            schema: { attributes: [] },
            changes: [{ attribute: 'actions', op: 'Add', value: 'report' }],
        } as any)

        expect(runReportPipeline).toHaveBeenCalledWith(registry, false)
        expect(registry.res.send).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-updated' })
        expect(registry.fusion.forEachISCAccount).not.toHaveBeenCalled()
    })
})




