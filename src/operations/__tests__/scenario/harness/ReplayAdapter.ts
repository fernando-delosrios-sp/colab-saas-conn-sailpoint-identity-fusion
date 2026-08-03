import { StepDefinition } from '../framework/ScenarioRunner'
import { ChainContext, MockRegistry } from '../framework/ChainContext'
import { compareOutputs } from '../../../scenarioReplay'
import { createOperationTestRegistry, SourceConfigLike } from '../../harness/operationTestRegistry'
import { createTestRegistry } from '../../harness/testRegistry'
import { FusionConfig } from '../../../../model/config'
import { FusionAccount } from '../../../../model/fusionAccount'
import { buildManagedAccountKey } from '../../../../model/managedAccountKey'
import { toManagedAccountInfo } from '../../../../model/fusionRun'
import {
    processAttributeMapping as _processAttributeMapping,
    buildAttributeMappingConfig as _buildAttributeMappingConfig,
} from '../../../../services/mappingService/helpers'
import { MappingService } from '../../../../services/mappingService/mappingService'
import { DefinitionService } from '../../../../services/definitionService/definitionService'
import { SchemaService } from '../../../../services/schemaService/schemaService'
import type { Mock } from 'vitest'


function mergeFusionAccountIntoMap(fusionMap: Map<string, any>, fa: any): void {
    const nid = fa.managedKey || fa.key?.simple?.id || fa.attributes?.id
    if (!nid) return
    const existing = fusionMap.get(nid) ?? {}
    fusionMap.set(nid, {
        ...existing,
        ...fa,
        managedKey: fa.managedKey ?? existing.managedKey ?? nid,
    })
}

function mergeIscOutputIntoFusionMap(
    fusionMap: Map<string, any>,
    out: any,
    state: ChainContext['state']
): void {
    const nid = out?.key?.simple?.id || out?.attributes?.id
    if (!nid || !out.attributes) return
    const identityId = findIdentityIdForIscAccount(out, state)
    const existing = fusionMap.get(nid) ?? {}
    fusionMap.set(nid, {
        ...existing,
        managedKey: nid,
        identityId: identityId ?? existing.identityId,
        disabled: out.disabled !== undefined ? out.disabled : existing.disabled,
        attributes: {
            ...(existing.attributes ?? {}),
            ...(out.attributes ?? {}),
        },
    })
}

function flattenManagedAccountsFromSnapshot(state: ChainContext['state']): any[] {
    const allManaged: any[] = []
    const snapshot = state.getSnapshot()
    if (!snapshot?.managedAccounts) return allManaged

    if (Array.isArray(snapshot.managedAccounts)) {
        allManaged.push(...snapshot.managedAccounts)
        return allManaged
    }

    for (const sweepAccounts of Object.values(snapshot.managedAccounts)) {
        if (Array.isArray(sweepAccounts)) {
            allManaged.push(...sweepAccounts)
        }
    }
    return allManaged
}

function getOrBuildIdentity(id: string, state: ChainContext['state']): any {
    console.log('getOrBuildIdentity called for id:', id)
    const existing = state.getIdentityById(id)
    if (existing && existing.accounts && existing.accounts.length > 0) {
        console.log(
            'getOrBuildIdentity: found existing with accounts:',
            existing.id,
            'accounts count:',
            existing.accounts.length
        )
        return existing
    }

    const relatedAccounts = flattenManagedAccountsFromSnapshot(state).filter(
        (m: any) => m.identityId === id || m.identity?.id === id
    )

    console.log('getOrBuildIdentity: related accounts count:', relatedAccounts.length)

    if (relatedAccounts.length === 0) {
        return existing || undefined
    }

    const firstAccount = relatedAccounts[0]
    const identityName = firstAccount.identity?.name || firstAccount.name || id

    let email: string | undefined = undefined
    for (const acc of relatedAccounts) {
        const mailVal = acc.attributes?.mail || acc.attributes?.email || acc.attributes?.emailAddress
        if (mailVal) {
            email = String(mailVal)
            break
        }
    }

    const accounts = relatedAccounts.map((ma: any) => ({
        source: {
            id: ma.sourceId || `source-${ma.sourceName}`,
            name: ma.sourceName,
        },
        nativeIdentity: ma.nativeIdentity,
        accountId: ma.nativeIdentity,
    }))

    if (existing) {
        console.log(
            'getOrBuildIdentity: updating existing identity:',
            existing.id,
            'with accounts count:',
            accounts.length
        )
        existing.accounts = accounts
        if (!existing.attributes) {
            existing.attributes = {}
        }
        if (!existing.attributes.email) {
            existing.attributes.email = email
        }
        return existing
    }

    const dynamicIdentity = {
        id,
        name: identityName,
        attributes: {
            id,
            name: identityName,
            email,
        },
        accounts,
    }

    console.log('getOrBuildIdentity: created new dynamic identity:', id, 'with accounts count:', accounts.length)
    state.addIdentity(dynamicIdentity)

    return dynamicIdentity
}

function findIdentityIdForIscAccount(iscAccount: any, state: any): string | undefined {
    const attributes = iscAccount.attributes ?? {}
    const accounts = [...(attributes.accounts ?? []), attributes.originAccount, attributes.mainAccount].filter(Boolean)

    for (const accId of accounts) {
        if (accId.includes('::')) {
            const [sourceId, nativeIdentity] = accId.split('::')
            const snapshot = state.getSnapshot()
            const allManaged: any[] = []
            if (snapshot?.managedAccounts) {
                if (Array.isArray(snapshot.managedAccounts)) {
                    allManaged.push(...snapshot.managedAccounts)
                } else {
                    for (const sweepAccounts of Object.values(snapshot.managedAccounts)) {
                        if (Array.isArray(sweepAccounts)) {
                            allManaged.push(...sweepAccounts)
                        }
                    }
                }
            }
            const ma = allManaged.find(
                (m: any) =>
                    m.nativeIdentity === nativeIdentity && (m.sourceId === sourceId || m.sourceName === sourceId)
            )
            if (ma?.identityId) {
                return ma.identityId
            }
            if (ma?.identity?.id) {
                return ma.identity.id
            }
        } else {
            const identity = state.getIdentityById(accId)
            if (identity) {
                return identity.id
            }
        }
    }

    const displayName = attributes.displayName
    if (displayName) {
        const identity = state.getIdentities().find((i: any) => i.displayName === displayName || i.name === displayName)
        if (identity) {
            return identity.id
        }
    }

    const name = attributes.name
    if (name) {
        const cleanName = name.replace(/\s*\[.*\]\s*$/, '')
        const identity = state
            .getIdentities()
            .find((i: any) => i.name === cleanName || i.displayName === cleanName || i.name === name)
        if (identity) {
            return identity.id
        }
    }

    return undefined
}

function ensureFusionAccountsPopulated(step: StepDefinition, context: ChainContext): void {
    const state = context.state
    const scenario = (context as any).scenario
    if (!scenario) return

    const fusionMap = new Map<string, any>()

    const initialFusionAccounts = scenario.initialState?.fusionAccounts ?? []
    for (const fa of initialFusionAccounts) {
        const nid = fa.managedKey || fa.key?.simple?.id || fa.attributes?.id
        if (nid) {
            fusionMap.set(nid, { ...fa })
        }
    }

    const currentStepIndex = scenario.steps.indexOf(step)
    const previousSteps = currentStepIndex >= 0 ? scenario.steps.slice(0, currentStepIndex) : []

    const processStepOutput = (s: StepDefinition) => {
        const output = s.expectedOutput
        if (output) {
            const outputs = Array.isArray(output) ? output : [output]
            for (const out of outputs) {
                mergeIscOutputIntoFusionMap(fusionMap, out, state)
            }
        }

        const delta = s.expectedStateDelta
        if (delta) {
            const deltaFusionAccounts = delta.fusionAccounts as any[] | undefined
            if (deltaFusionAccounts && deltaFusionAccounts.length > 0) {
                for (const fa of deltaFusionAccounts) {
                    mergeFusionAccountIntoMap(fusionMap, fa)
                }
            }

            const deltaFusionAccountsAdd = delta.fusionAccountsAdd as any[] | undefined
            if (deltaFusionAccountsAdd) {
                for (const fa of deltaFusionAccountsAdd) {
                    mergeFusionAccountIntoMap(fusionMap, fa)
                }
            }
        }
    }

    for (const prevStep of previousSteps) {
        processStepOutput(prevStep)
    }

    for (const fa of fusionMap.values()) {
        state.addFusionAccount(fa)
    }
}

export function buildReplayContext(step: StepDefinition, context: ChainContext): ChainContext {
    const state = context.state
    const sweep = step.sweep ?? 1

    // Configure the shared configuration of FusionAccount with context configuration
    FusionAccount.configure(context.config as any)

    const scenarioSources = (context.config?.sources as Array<Record<string, unknown>>) ?? []
    const sourceConfigs: SourceConfigLike[] = scenarioSources.map((s) => ({
        name: (s.name as string) ?? 'unknown',
        correlationMode: (s.correlationMode as SourceConfigLike['correlationMode']) ?? 'none',
        sourceType: (s.sourceType as SourceConfigLike['sourceType']) ?? 'authoritative',
    }))

    if (context.replayAdapter) {
        const stepTimestamp = context.options?.stepTimestamp
        if (stepTimestamp) {
            context.replayAdapter.seekBefore(stepTimestamp)
        }
        if (step.operation === 'accountList') {
            state.setServiceRegistry(undefined)
        }

        let registry = state.getServiceRegistry<ReturnType<typeof createTestRegistry>>()
        if (!registry) {
            registry = createTestRegistry({
                sourceConfigs: scenarioSources as any,
                config: context.config as FusionConfig,
            })
            registry.client.wrapAdapter(() => context.replayAdapter!)
            ;(registry.log as any).crash = vi.fn()
            registry.log.error = vi.fn().mockImplementation((...args) => {
                console.error('LOG.ERROR:', ...args)
            })
            registry.log.warn = vi.fn().mockImplementation((...args) => {
                console.warn('LOG.WARN:', ...args)
            })
            registry.workflows.testWorkflow = vi.fn().mockResolvedValue({ status: 200 })
            state.setServiceRegistry(registry)
        }

        registry.res.send = vi.fn()
        context.registry = registry as unknown as MockRegistry
        return context
    }

    ensureFusionAccountsPopulated(step, context)

    const registry = createOperationTestRegistry({ sourceConfigs: sourceConfigs as any })

    registry.log.error = vi.fn().mockImplementation((...args) => {
        console.error('LOG.ERROR:', ...args)
    })
    registry.log.warn = vi.fn().mockImplementation((...args) => {
        console.warn('LOG.WARN:', ...args)
    })

    configureNonReplayMocks(registry, context, state, sweep, scenarioSources)

    registry.res.send = vi.fn()

    context.registry = registry as unknown as MockRegistry

    return context
}

function configureNonReplayMocks(
    registry: ReturnType<typeof createOperationTestRegistry>,
    context: ChainContext,
    state: ChainContext['state'],
    sweep: number,
    scenarioSources: Array<Record<string, unknown>>
): void {
    const schemaService = new SchemaService(context.config as any, registry.log as any, registry.sources as any, registry.client as any)
    registry.schemas = schemaService as any

    // Mock fetchAllSources to populate managedSources from config
    registry.sources.fetchAllSources = vi.fn().mockImplementation(async () => {
        registry.sources.managedSources = scenarioSources.map((s) => ({
            id: (s.id as string) ?? `source-${s.name}`,
            name: s.name as string,
            config: s,
        })) as any[]
    })

    const managedAccounts = state.getManagedAccounts(sweep)
    const map = new Map<string, unknown>()
    const byIdentity = new Map<string, Set<string>>()
    for (const account of managedAccounts) {
        const key = buildManagedAccountKey(account) || account.id
        map.set(key, account)
        const identityId = account.identityId || account.identity?.id
        if (identityId) {
            let set = byIdentity.get(identityId)
            if (!set) {
                set = new Set<string>()
                byIdentity.set(identityId, set)
            }
            set.add(key)
        }
    }
    registry.sources.run.managedAccountsById = map
    registry.sources.run.managedAccountInventory.clear()
    for (const [key, account] of map.entries()) {
        registry.sources.run.managedAccountInventory.set(key, toManagedAccountInfo(account as any))
    }
    registry.sources.run.managedAccountsByIdentityId = byIdentity

    registry.sources.fetchManagedAccounts = vi.fn().mockImplementation(async () => {
        registry.sources.run.managedAccountsById = map
        registry.sources.run.managedAccountInventory.clear()
        for (const [key, account] of map.entries()) {
            registry.sources.run.managedAccountInventory.set(key, toManagedAccountInfo(account as any))
        }
        registry.sources.run.managedAccountsByIdentityId = byIdentity
    })

    registry.sources.fetchManagedAccount = vi
        .fn()
        .mockImplementation(async (sourceId: string, nativeIdentity: string) => {
            const account = managedAccounts.find(
                (a: any) =>
                    a.nativeIdentity === nativeIdentity &&
                    (a.sourceId === sourceId || a.sourceName === sourceId || `source-${a.sourceName}` === sourceId)
            )
            if (account) {
                const key = buildManagedAccountKey(account) || account.id
                registry.sources.run.setManagedAccount(key, account)
                const identityId = account.identityId || account.identity?.id
                if (identityId) {
                    let set = registry.sources.run.managedAccountsByIdentityId.get(identityId)
                    if (!set) {
                        set = new Set<string>()
                        registry.sources.run.managedAccountsByIdentityId.set(identityId, set)
                    }
                    set.add(key)
                }
            }
        })

    registry.identities.fetchIdentities = vi.fn().mockImplementation(async () => {
        registry.identities.identityCount = state.getIdentities().length
    })
    registry.identities.fetchIdentityByName = vi.fn().mockImplementation(async (name: string) => {
        const existing = state.getIdentityByName(name)
        if (existing) return existing

        const ma = flattenManagedAccountsFromSnapshot(state).find(
            (m: any) => m.identity?.name === name || m.name === name
        )
        if (ma) {
            const identityId = ma.identityId || ma.identity?.id
            if (identityId) {
                return getOrBuildIdentity(identityId, state)
            }
        }
        return null
    })
    registry.identities.getIdentityById = vi.fn().mockImplementation((id: string) => {
        console.log('registry.identities.getIdentityById mock called for id:', id)
        return getOrBuildIdentity(id, state)
    })
    registry.identities.fetchIdentityById = vi.fn().mockImplementation(async (id: string) => {
        console.log('registry.identities.fetchIdentityById mock called for id:', id)
        return getOrBuildIdentity(id)
    })

    const fusionAccounts = state.getFusionAccounts()
    const getNativeIdentity = (a: any) => a.managedKey || a.key?.simple?.id || a.attributes?.id
    const fusionMap = new Map<string, any>()
    for (const a of fusionAccounts) {
        const nid = getNativeIdentity(a)
        if (nid) {
            fusionMap.set(nid, a)
        }
    }

    registry.sources.fusionAccountsByNativeIdentity = fusionMap
    registry.sources.fusionAccounts = fusionAccounts
    registry.sources.fusionAccountCount = fusionAccounts.length

    registry.sources.fetchFusionAccounts = vi.fn().mockImplementation(async () => {
        registry.sources.fusionAccountsByNativeIdentity = fusionMap
        registry.sources.fusionAccounts = fusionAccounts
    })

    registry.sources.fetchFusionAccount = vi.fn().mockImplementation(async (nativeIdentity: string) => {
        const account = fusionAccounts.find((a) => getNativeIdentity(a) === nativeIdentity)
        if (account) {
            fusionMap.set(nativeIdentity, account)
        }
    })

    // Mock form fetch methods to populate from recorded state
    const forms = state.getForms()
    const finishedDecisions = (state.toJSON().finishedFusionDecisions as Array<Record<string, unknown>> | undefined) ?? []
    const seedDecisions = finishedDecisions.length > 0 ? finishedDecisions : forms
    if (seedDecisions.length > 0) {
        registry.forms.fetchFormInstances = vi.fn().mockResolvedValue(undefined)
        registry.forms.processFetchedFormData = vi.fn().mockImplementation(async () => {
            registry.forms.seedFinishedFusionDecisions(seedDecisions as any)
        })
    }

    registry.sources.getSourceByName = vi.fn().mockImplementation((name: string) => {
        const src = scenarioSources.find((s) => s.name === name)
        if (src) {
            return {
                id: (src.id as string) ?? `source-${src.name}`,
                name: src.name as string,
                isManaged: src.correlationMode !== 'reverse',
                config: src,
            }
        }
        return undefined
    })

    registry.sources.getSourceById = vi.fn().mockImplementation((sourceId: string) => {
        const src = scenarioSources.find(
            (s) => s.id === sourceId || s.name === sourceId || `source-${s.name}` === sourceId
        )
        if (src) {
            return {
                id: (src.id as string) ?? `source-${src.name}`,
                name: src.name as string,
                isManaged: src.correlationMode !== 'reverse',
                config: src,
            }
        }
        const ma = state.getManagedAccounts(sweep).find((a: any) => a.sourceId === sourceId)
        if (ma) {
            const name = ma.sourceName
            const configSrc = scenarioSources.find((s) => s.name === name)
            return {
                id: sourceId,
                name,
                isManaged: true,
                config: configSrc,
            }
        }
        return undefined
    })

    // Mock the fusion service behavior specifically for replay runs
    const activeFusionIdentities = new Map<string, any>()
    const mappingService = new MappingService(
        context.config as any,
        registry.log,
    )
    const definitionService = new DefinitionService(
        context.config as any,
        registry.schemas as any,
        registry.log,
        {} as any,
    )
    registry.fusion.refreshUniqueAttributes = vi.fn().mockResolvedValue(0)
    registry.fusion.processFusionAccounts = vi.fn().mockImplementation(async () => {
        const processed = []
        const state = new EntityState(context)
        const faList = state.getFusionAccounts()
        for (const fusionAccount of faList) {
            // Evaluate and map attributes using real MappingService/DefinitionService logic
            mappingService.mapAttributes(fusionAccount, registry.fusion as any)
            await definitionService.refreshNormalAttributes(fusionAccount)
            await definitionService.refreshUniqueAttributes(fusionAccount)
            definitionService.refreshReverseCorrelationAttributes(fusionAccount)
            processed.push(fusionAccount)
        }
        return processed
    })

    registry.fusion.processFusionAccounts = vi.fn().mockImplementation(async () => {
        const processed = []
        const faList = state.getFusionAccounts()
        console.log('processFusionAccounts mock: got managed source accounts count:', faList.length)
        for (const managedSourceAccount of faList) {
            const processedFa = await registry.fusion.processFusionAccount(managedSourceAccount)
            const managedKey = managedSourceAccount.managedKey // Use managed source account's managedKey to match what's in state
            const existingInState = state.getFusionAccount(managedKey)
            console.log(
                `processFusionAccounts mock: processed account managedKey=${managedKey}, existingInState=${!!existingInState}`
            )
            if (existingInState) {
                processedFa.syncCollectionAttributesToBag()
                existingInState.attributes = { ...processedFa.attributes }
                existingInState.disabled = processedFa.disabled
            }
            processed.push(processedFa)
        }
        return processed
    })

    registry.fusion.correlateMissingAccountsPerSource = vi.fn().mockImplementation(async (fusionAccount) => {
        const missingIds = [...fusionAccount.missingAccountIds]
        for (const accountId of missingIds) {
            fusionAccount.setCorrelatedAccount(accountId)
        }
        fusionAccount.updateCorrelationStatus()
    })

    registry.fusion.processIdentity = vi.fn().mockImplementation(async (identity) => {
        console.log('processIdentity mock called for:', identity.id, 'attributes:', JSON.stringify(identity.attributes))
        const fusionAccount = FusionAccount.fromIdentity(identity)
        fusionAccount.addIdentityLayer(identity)
        fusionAccount.addManagedAccountLayer(
            registry.sources.run,
            { pruneDeleted: true, addBlendHistory: true }
        )

        // Force refresh to ensure attributes evaluate
        fusionAccount.setNeedsRefresh(true)

        // Evaluate and map attributes using real MappingService/DefinitionService logic
        mappingService.mapAttributes(fusionAccount, registry.fusion as any)
        await definitionService.refreshNormalAttributes(fusionAccount)
        await definitionService.refreshUniqueAttributes(fusionAccount)
        definitionService.refreshReverseCorrelationAttributes(fusionAccount)

        activeFusionIdentities.set(identity.id, fusionAccount)

        // Also add to state so that getISCAccount and output see it!
        const managedKey = fusionAccount.managedKey
        if (managedKey) {
            const stateFusionAccount = {
                key: { simple: { id: managedKey } },
                managedKey,
                identityId: identity.id,
                attributes: { ...fusionAccount.attributes },
                disabled: fusionAccount.disabled,
            }
            state.addFusionAccount(stateFusionAccount)
            console.log('processIdentity mock: added fusion account to state:', managedKey)
        }

        return fusionAccount
    })

    registry.fusion.processIdentities = vi.fn().mockImplementation(async () => {
        const processed = []
        const ids = state.getIdentities()
        console.log('processIdentities mock: got identities count:', ids.length)
        for (const identity of ids) {
            const existingFa = state.getFusionAccounts().find((fa) => fa.identityId === identity.id)
            console.log(`processIdentities mock: identity=${identity.id}, existingFa=${!!existingFa}`)
            if (!existingFa) {
                const processedFa = await registry.fusion.processIdentity(identity)
                if (processedFa) {
                    processed.push(processedFa)
                }
            }
        }
        return processed
    })

    registry.fusion.getFusionIdentity = vi.fn().mockImplementation((id: string) => {
        return activeFusionIdentities.get(id)
    })

    registry.fusion.getISCAccount = vi.fn().mockImplementation(async (fusionAccount: any) => {
        if (typeof fusionAccount.syncCollectionAttributesToBag === 'function') {
            fusionAccount.syncCollectionAttributesToBag()
        }

        const finalId = fusionAccount.attributes?.id || fusionAccount.managedKey
        if (finalId && !fusionAccount.key) {
            if (typeof fusionAccount.setKey === 'function') {
                fusionAccount.setKey({ simple: { id: finalId } })
            } else {
                fusionAccount.key = { simple: { id: finalId } }
            }
        }

        const managedKey = fusionAccount.managedKey
        const stateFusionAccount = state.getFusionAccount(managedKey)
        if (stateFusionAccount) {
            stateFusionAccount.attributes = { ...fusionAccount.attributes }
            stateFusionAccount.disabled = fusionAccount.disabled
        } else {
            const newStateFusionAccount: any = {
                key: fusionAccount.key || {
                    simple: {
                        id: managedKey,
                    },
                },
                managedKey,
                attributes: { ...fusionAccount.attributes },
                disabled: fusionAccount.disabled,
                identityId: fusionAccount.identityId,
            }
            state.addFusionAccount(newStateFusionAccount)
            fusionAccounts.push(newStateFusionAccount)
            fusionMap.set(managedKey, newStateFusionAccount)
        }

        const attributes = registry.schemas.getFusionAttributeSubset(fusionAccount.attributes)
        console.log(
            'getISCAccount returning attributes for',
            nativeId,
            'keys:',
            Object.keys(attributes),
            'accounts:',
            attributes.accounts,
            'raw_accounts:',
            fusionAccount.attributes.accounts
        )
        return {
            key: fusionAccount.key || {
                simple: {
                    id: nativeId,
                },
            },
            attributes,
            disabled: fusionAccount.disabled,
        }
    })

    registry.fusion.forEachISCAccount = vi.fn().mockImplementation(async (send: (account: any) => void) => {
        let sent = 0
        const faList = state.getFusionAccounts()
        console.log('forEachISCAccount mock: state.getFusionAccounts() count:', faList.length)
        for (const account of faList) {
            const iscAccount = await registry.fusion.getISCAccount(account)
            console.log(
                `forEachISCAccount mock: getISCAccount for managedKey=${account.managedKey} produced iscAccount=${!!iscAccount}`
            )
            if (iscAccount) {
                send(iscAccount)
                sent++
            }
        }
        console.log(`forEachISCAccount mock: sent ${sent} accounts out of ${faList.length}`)
        return { sent, eligible: faList.length }
    })

    registry.fusion.streamAndClearEligibleAccounts = vi.fn().mockImplementation(async (send: (account: any) => void, predicate: any) => {
        let sent = 0
        const faList = state.getFusionAccounts()
        const eligibleList = faList.filter(predicate)
        console.log('streamAndClearEligibleAccounts mock: eligible count:', eligibleList.length)
        for (const account of eligibleList) {
            const iscAccount = await registry.fusion.getISCAccount(account)
            if (iscAccount) {
                send(iscAccount)
                sent++
            }
        }
        return { sent, eligible: eligibleList.length }
    })
}

export function collectOutputs(context: ChainContext): unknown[] {
    const sent: unknown[] = []
    if (context.registry.res && 'send' in (context.registry.res ?? {})) {
        const mock = (context.registry as any).res.send as Mock
        if (mock?.mock?.calls) {
            for (const call of mock.mock.calls) {
                sent.push(call[0])
            }
        }
    }
    return sent
}

export { compareOutputs }

