import { StepDefinition } from '../framework/ChainRunner'
import { ChainContext, MockRegistry } from '../framework/ChainContext'
import { createBaseOperationRegistry, SourceConfigLike } from '../../harness/mockRegistry'

const replayOutputs = new Map<string, unknown>()

export function setExpectedOutput(stepId: string, output: unknown): void {
    replayOutputs.set(stepId, output)
}

export function getExpectedOutput(stepId: string): unknown {
    return replayOutputs.get(stepId)
}

export function buildReplayContext(step: StepDefinition, context: ChainContext): ChainContext {
    const state = context.state
    const pass = step.pass ?? 1

    const sourceConfigs: SourceConfigLike[] = (
        (step.expectedStateDelta?.sources as Array<Record<string, unknown>>) ?? []
    ).map((s) => ({
        name: (s.name as string) ?? 'unknown',
        correlationMode: (s.correlationMode as SourceConfigLike['correlationMode']) ?? 'none',
    }))

    const { registry } = createBaseOperationRegistry(sourceConfigs)

    const managedAccounts = state.getManagedAccounts(pass)
    if (managedAccounts.length > 0) {
        const map = new Map<string, unknown>()
        for (const account of managedAccounts) {
            map.set(account.id, account)
        }
        registry.sources.managedAccountsById = map
        registry.sources.managedAccountsAllById = new Map(map)

        registry.sources.fetchManagedAccounts = jest.fn().mockImplementation(async () => {
            registry.sources.managedAccountsById = map
            registry.sources.managedAccountsAllById = new Map(map)
        })
    }

    const identities = state.getIdentities()
    if (identities.length > 0) {
        const identityMap = new Map<string, unknown>()
        for (const identity of identities) {
            identityMap.set(identity.id, identity)
        }
        registry.identities.fetchIdentities = jest.fn().mockImplementation(async () => {
            registry.identities.identityCount = identities.length
        })
        registry.identities.fetchIdentityByName = jest.fn().mockImplementation(async (name: string) => {
            return state.getIdentityByName(name) ?? null
        })
        registry.identities.getIdentityById = jest.fn().mockImplementation((id: string) => {
            return state.getIdentityById(id)
        })
    }

    const fusionAccounts = state.getFusionAccounts()
    if (fusionAccounts.length > 0) {
        const fusionMap = new Map(fusionAccounts.map((a) => [a.nativeIdentity, a]))
        registry.sources.fusionAccountsByNativeIdentity = fusionMap
        registry.sources.fusionAccounts = fusionAccounts
        registry.sources.fusionAccountCount = fusionAccounts.length

        registry.sources.fetchFusionAccounts = jest.fn().mockImplementation(async () => {
            registry.sources.fusionAccountsByNativeIdentity = fusionMap
            registry.sources.fusionAccounts = fusionAccounts
        })
    }

    registry.sources.getSourceByName = jest.fn().mockImplementation((name: string) => {
        return sourceConfigs.find((s: any) => s.name === name)
    })

    registry.res.send = jest.fn()

    context.registry = registry as unknown as MockRegistry

    return context
}

export function collectOutputs(context: ChainContext): unknown[] {
    const sent: unknown[] = []
    if (context.registry.res && 'send' in (context.registry.res ?? {})) {
        const mock = (context.registry as any).res.send as jest.Mock
        if (mock?.mock?.calls) {
            for (const call of mock.mock.calls) {
                sent.push(call[0])
            }
        }
    }
    return sent
}

export function compareOutputs(
    actual: unknown[],
    expected: unknown,
    stepId: string
): { match: boolean; drift: string[] } {
    const drift: string[] = []

    if (expected === undefined || expected === null) {
        return { match: true, drift: [] }
    }

    if (actual.length === 0 && expected !== undefined) {
        return { match: false, drift: [`${stepId}: expected output but got none`] }
    }

    if (actual.length === 1) {
        try {
            const expectedObj = expected as Record<string, unknown>
            const actualObj = actual[0] as Record<string, unknown>
            const keys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)])
            for (const key of keys) {
                if (JSON.stringify(expectedObj[key]) !== JSON.stringify(actualObj[key])) {
                    drift.push(
                        `${stepId}.${key}: expected ${JSON.stringify(expectedObj[key])}, got ${JSON.stringify(actualObj[key])}`
                    )
                }
            }
        } catch {
            drift.push(`${stepId}: could not compare outputs`)
        }
    } else {
        const expectedArray = Array.isArray(expected) ? expected : [expected]
        if (actual.length !== expectedArray.length) {
            drift.push(`${stepId}: expected ${expectedArray.length} outputs, got ${actual.length}`)
        }
    }

    return { match: drift.length === 0, drift }
}
