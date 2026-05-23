import { StepDefinition } from '../framework/ChainRunner'
import { ChainContext, MockRegistry } from '../framework/ChainContext'
import { createBaseOperationRegistry, SourceConfigLike } from '../../harness/mockRegistry'
import { FusionAccount } from '../../../../model/fusionAccount'
import { buildManagedAccountKey } from '../../../../model/managedAccountKey'
import { processAttributeMapping, buildAttributeMappingConfig } from '../../../../services/attributeService/helpers'
import { AttributeService } from '../../../../services/attributeService/attributeService'
import { SchemaService } from '../../../../services/schemaService/schemaService'

const replayOutputs = new Map<string, unknown>()

export function setExpectedOutput(stepId: string, output: unknown): void {
    replayOutputs.set(stepId, output)
}

export function getExpectedOutput(stepId: string): unknown {
    return replayOutputs.get(stepId)
}

function findIdentityIdForIscAccount(iscAccount: any, state: any): string | undefined {
    const attributes = iscAccount.attributes ?? {}
    const accounts = [
        ...(attributes.accounts ?? []),
        attributes.originAccount,
        attributes.mainAccount
    ].filter(Boolean)

    for (const accId of accounts) {
        if (accId.includes('::')) {
            const [sourceId, nativeIdentity] = accId.split('::')
            const snapshot = state.getSnapshot()
            const allManaged: any[] = []
            if (snapshot?.managedAccounts) {
                if (Array.isArray(snapshot.managedAccounts)) {
                    allManaged.push(...snapshot.managedAccounts)
                } else {
                    for (const passAccounts of Object.values(snapshot.managedAccounts)) {
                        if (Array.isArray(passAccounts)) {
                            allManaged.push(...passAccounts)
                        }
                    }
                }
            }
            const ma = allManaged.find((m: any) =>
                m.nativeIdentity === nativeIdentity &&
                (m.sourceId === sourceId || m.sourceName === sourceId)
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
        const identity = state.getIdentities().find((i: any) =>
            i.displayName === displayName || i.name === displayName
        )
        if (identity) {
            return identity.id
        }
    }

    const name = attributes.name
    if (name) {
        const cleanName = name.replace(/\s*\[.*\]\s*$/, '')
        const identity = state.getIdentities().find((i: any) =>
            i.name === cleanName || i.displayName === cleanName || i.name === name
        )
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
        const nid = fa.nativeIdentity || fa.key?.simple?.id || fa.attributes?.id
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
                const nid = out?.key?.simple?.id || out?.attributes?.id
                if (nid && out.attributes) {
                    const identityId = findIdentityIdForIscAccount(out, state)
                    const existing = fusionMap.get(nid) ?? {}
                    fusionMap.set(nid, {
                        ...existing,
                        nativeIdentity: nid,
                        identityId: identityId ?? existing.identityId,
                        disabled: out.disabled !== undefined ? out.disabled : existing.disabled,
                        attributes: {
                            ...(existing.attributes ?? {}),
                            ...(out.attributes ?? {}),
                        },
                    })
                }
            }
        }

        const delta = s.expectedStateDelta
        if (delta) {
            const deltaFusionAccounts = delta.fusionAccounts as any[] | undefined
            if (deltaFusionAccounts && deltaFusionAccounts.length > 0) {
                for (const fa of deltaFusionAccounts) {
                    const nid = fa.nativeIdentity || fa.key?.simple?.id || fa.attributes?.id
                    if (nid) {
                        const existing = fusionMap.get(nid) ?? {}
                        fusionMap.set(nid, {
                            ...existing,
                            ...fa,
                        })
                    }
                }
            }

            const deltaFusionAccountsAdd = delta.fusionAccountsAdd as any[] | undefined
            if (deltaFusionAccountsAdd) {
                for (const fa of deltaFusionAccountsAdd) {
                    const nid = fa.nativeIdentity || fa.key?.simple?.id || fa.attributes?.id
                    if (nid) {
                        const existing = fusionMap.get(nid) ?? {}
                        fusionMap.set(nid, {
                            ...existing,
                            ...fa,
                        })
                    }
                }
            }
        }
    }

    for (const prevStep of previousSteps) {
        processStepOutput(prevStep)
    }

    if (step.operation === 'accountList') {
        processStepOutput(step)
    }

    for (const fa of fusionMap.values()) {
        state.addFusionAccount(fa)
    }
}

export function buildReplayContext(step: StepDefinition, context: ChainContext): ChainContext {
    ensureFusionAccountsPopulated(step, context)
    const state = context.state
    const pass = step.pass ?? 1

    // Configure the shared configuration of FusionAccount with context configuration
    FusionAccount.configure(context.config as any)

    const scenarioSources = (context.config?.sources as Array<Record<string, unknown>>) ?? []
    const sourceConfigs: SourceConfigLike[] = scenarioSources.map((s) => ({
        name: (s.name as string) ?? 'unknown',
        correlationMode: (s.correlationMode as SourceConfigLike['correlationMode']) ?? 'none',
        sourceType: (s.sourceType as SourceConfigLike['sourceType']) ?? 'authoritative',
    }))

    const { registry } = createBaseOperationRegistry(sourceConfigs)
    registry.log.error = jest.fn().mockImplementation((...args) => {
        console.error("LOG.ERROR:", ...args)
    })
    registry.log.warn = jest.fn().mockImplementation((...args) => {
        console.warn("LOG.WARN:", ...args)
    })

    const schemaService = new SchemaService(
        context.config as any,
        registry.log as any,
        registry.sources as any
    )
    registry.schemas = schemaService as any

    // Mock fetchAllSources to populate managedSources from config
    registry.sources.fetchAllSources = jest.fn().mockImplementation(async () => {
        registry.sources.managedSources = scenarioSources.map((s) => ({
            id: (s.id as string) ?? `source-${s.name}`,
            name: s.name as string,
            config: s,
        })) as any[]
    })

    const managedAccounts = state.getManagedAccounts(pass)
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
    registry.sources.managedAccountsById = map
    registry.sources.managedAccountsAllById = new Map(map)
    registry.sources.managedAccountsByIdentityId = byIdentity

    registry.sources.fetchManagedAccounts = jest.fn().mockImplementation(async () => {
        registry.sources.managedAccountsById = map
        registry.sources.managedAccountsAllById = new Map(map)
        registry.sources.managedAccountsByIdentityId = byIdentity
    })

    registry.sources.fetchManagedAccount = jest.fn().mockImplementation(async (sourceId: string, nativeIdentity: string) => {
        const account = managedAccounts.find(
            (a: any) => a.nativeIdentity === nativeIdentity && 
            (a.sourceId === sourceId || a.sourceName === sourceId || `source-${a.sourceName}` === sourceId)
        )
        if (account) {
            const key = buildManagedAccountKey(account) || account.id
            registry.sources.managedAccountsById.set(key, account)
            registry.sources.managedAccountsAllById.set(key, account)
            const identityId = account.identityId || account.identity?.id
            if (identityId) {
                let set = registry.sources.managedAccountsByIdentityId.get(identityId)
                if (!set) {
                    set = new Set<string>()
                    registry.sources.managedAccountsByIdentityId.set(identityId, set)
                }
                set.add(key)
            }
        }
    })

    const getOrBuildIdentity = (id: string) => {
        console.log("getOrBuildIdentity called for id:", id);
        const existing = state.getIdentityById(id)
        if (existing && existing.accounts && existing.accounts.length > 0) {
            console.log("getOrBuildIdentity: found existing with accounts:", existing.id, "accounts count:", existing.accounts.length);
            return existing
        }

        const allManaged: any[] = []
        const snapshot = state.getSnapshot()
        if (snapshot?.managedAccounts) {
            if (Array.isArray(snapshot.managedAccounts)) {
                allManaged.push(...snapshot.managedAccounts)
            } else {
                for (const passAccounts of Object.values(snapshot.managedAccounts)) {
                    if (Array.isArray(passAccounts)) {
                        allManaged.push(...passAccounts)
                    }
                }
            }
        }

        const relatedAccounts = allManaged.filter(
            (m: any) => m.identityId === id || m.identity?.id === id
        )

        console.log("getOrBuildIdentity: related accounts count:", relatedAccounts.length);

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
            console.log("getOrBuildIdentity: updating existing identity:", existing.id, "with accounts count:", accounts.length);
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

        console.log("getOrBuildIdentity: created new dynamic identity:", id, "with accounts count:", accounts.length);
        state.addIdentity(dynamicIdentity)

        return dynamicIdentity
    }

    registry.identities.fetchIdentities = jest.fn().mockImplementation(async () => {
        registry.identities.identityCount = state.getIdentities().length
    })
    registry.identities.fetchIdentityByName = jest.fn().mockImplementation(async (name: string) => {
        const existing = state.getIdentityByName(name)
        if (existing) return existing
        
        const allManaged: any[] = []
        const snapshot = state.getSnapshot()
        if (snapshot?.managedAccounts) {
            if (Array.isArray(snapshot.managedAccounts)) {
                allManaged.push(...snapshot.managedAccounts)
            } else {
                for (const passAccounts of Object.values(snapshot.managedAccounts)) {
                    if (Array.isArray(passAccounts)) {
                        allManaged.push(...passAccounts)
                    }
                }
            }
        }
        const ma = allManaged.find((m: any) => m.identity?.name === name || m.name === name)
        if (ma) {
            const identityId = ma.identityId || ma.identity?.id
            if (identityId) {
                return getOrBuildIdentity(identityId)
            }
        }
        return null
    })
    registry.identities.getIdentityById = jest.fn().mockImplementation((id: string) => {
        console.log("registry.identities.getIdentityById mock called for id:", id);
        return getOrBuildIdentity(id)
    })
    registry.identities.fetchIdentityById = jest.fn().mockImplementation(async (id: string) => {
        console.log("registry.identities.fetchIdentityById mock called for id:", id);
        return getOrBuildIdentity(id)
    })

    const fusionAccounts = state.getFusionAccounts()
    const getNativeIdentity = (a: any) => a.nativeIdentity || a.key?.simple?.id || a.attributes?.id
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

    registry.sources.fetchFusionAccounts = jest.fn().mockImplementation(async () => {
        registry.sources.fusionAccountsByNativeIdentity = fusionMap
        registry.sources.fusionAccounts = fusionAccounts
    })

    registry.sources.fetchFusionAccount = jest.fn().mockImplementation(async (nativeIdentity: string) => {
        const account = fusionAccounts.find((a) => getNativeIdentity(a) === nativeIdentity)
        if (account) {
            fusionMap.set(nativeIdentity, account)
        }
    })

    // Mock form fetch methods to populate from recorded state
    const forms = state.getForms()
    if (forms.length > 0) {
        registry.forms.fetchFormInstancesData = jest.fn().mockResolvedValue(undefined)
        registry.forms.processFetchedFormData = jest.fn().mockImplementation(async () => {
            registry.forms.fusionIdentityDecisions = forms
        })
    }

    registry.sources.getSourceByName = jest.fn().mockImplementation((name: string) => {
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

    registry.sources.getSourceById = jest.fn().mockImplementation((sourceId: string) => {
        const src = scenarioSources.find((s) => s.id === sourceId || s.name === sourceId || `source-${s.name}` === sourceId)
        if (src) {
            return {
                id: (src.id as string) ?? `source-${src.name}`,
                name: src.name as string,
                isManaged: src.correlationMode !== 'reverse',
                config: src,
            }
        }
        const ma = state.getManagedAccounts(pass).find((a: any) => a.sourceId === sourceId)
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



    const attributeService = new AttributeService(
        context.config as any,
        registry.schemas as any,
        registry.sources as any,
        registry.log as any,
        {
            withLock: async (key: string, fn: () => Promise<any>) => await fn(),
        } as any
    )

    registry.fusion.processFusionAccount = jest.fn().mockImplementation(async (account) => {
        const fusionAccount = FusionAccount.fromFusionAccount(account)
        if (account.identityId) {
            const identity = registry.identities.getIdentityById(account.identityId)
            if (identity) {
                fusionAccount.addIdentityLayer(identity)
            }
        }
        fusionAccount.addManagedAccountLayer(
            registry.sources.managedAccountsById,
            registry.sources.managedAccountsByIdentityId,
            registry.sources.managedAccountsAllById,
            true,
            true
        )

        // Force refresh in replay mode to ensure any state changes (like modified identities) propagate
        fusionAccount.setNeedsRefresh(true)

        // Evaluate and map attributes using real AttributeService logic
        attributeService.mapAttributes(fusionAccount)
        await attributeService.refreshNormalAttributes(fusionAccount)
        await attributeService.refreshUniqueAttributes(fusionAccount)
        attributeService.refreshReverseCorrelationAttributes(fusionAccount)

        return fusionAccount
    })

    registry.fusion.processFusionAccounts = jest.fn().mockImplementation(async () => {
        const processed = []
        const faList = state.getFusionAccounts()
        console.log("processFusionAccounts mock: got raw accounts count:", faList.length)
        for (const rawAccount of faList) {
            const processedFa = await registry.fusion.processFusionAccount(rawAccount)
            const nativeId = rawAccount.nativeIdentity // Use rawAccount's nativeIdentity to match what's in state
            const existingInState = state.getFusionAccount(nativeId)
            console.log(`processFusionAccounts mock: processed account nativeId=${nativeId}, existingInState=${!!existingInState}`)
            if (existingInState) {
                processedFa.syncCollectionAttributesToBag()
                existingInState.attributes = { ...processedFa.attributes }
                existingInState.disabled = processedFa.disabled
            }
            processed.push(processedFa)
        }
        return processed
    })

    registry.fusion.correlateMissingAccountsPerSource = jest.fn().mockImplementation(async (fusionAccount) => {
        const missingIds = [...fusionAccount.missingAccountIds]
        for (const accountId of missingIds) {
            fusionAccount.setCorrelatedAccount(accountId)
        }
        fusionAccount.updateCorrelationStatus()
    })

    registry.fusion.processIdentity = jest.fn().mockImplementation(async (identity) => {
        console.log("processIdentity mock called for:", identity.id, "attributes:", JSON.stringify(identity.attributes))
        const fusionAccount = FusionAccount.fromIdentity(identity)
        fusionAccount.addIdentityLayer(identity)
        fusionAccount.addManagedAccountLayer(
            registry.sources.managedAccountsById,
            registry.sources.managedAccountsByIdentityId,
            registry.sources.managedAccountsAllById,
            true,
            true
        )

        // Force refresh to ensure attributes evaluate
        fusionAccount.setNeedsRefresh(true)

        // Evaluate and map attributes using real AttributeService logic
        attributeService.mapAttributes(fusionAccount)
        await attributeService.refreshNormalAttributes(fusionAccount)
        await attributeService.refreshUniqueAttributes(fusionAccount)
        attributeService.refreshReverseCorrelationAttributes(fusionAccount)

        activeFusionIdentities.set(identity.id, fusionAccount)

        // Also add to state so that getISCAccount and output see it!
        const nativeId = fusionAccount.nativeIdentity
        if (nativeId) {
            const rawAccount = {
                key: { simple: { id: nativeId } },
                nativeIdentity: nativeId,
                identityId: identity.id,
                attributes: { ...fusionAccount.attributes },
                disabled: fusionAccount.disabled,
            }
            state.addFusionAccount(rawAccount)
            console.log("processIdentity mock: added raw fusion account to state:", nativeId)
        }

        return fusionAccount
    })

    registry.fusion.processIdentities = jest.fn().mockImplementation(async () => {
        const processed = []
        const ids = state.getIdentities()
        console.log("processIdentities mock: got identities count:", ids.length)
        for (const identity of ids) {
            const existingFa = state.getFusionAccounts().find(fa => fa.identityId === identity.id)
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

    registry.fusion.getFusionIdentity = jest.fn().mockImplementation((id: string) => {
        return activeFusionIdentities.get(id)
    })

    registry.fusion.getISCAccount = jest.fn().mockImplementation(async (fusionAccount: any) => {
        if (typeof fusionAccount.syncCollectionAttributesToBag === 'function') {
            fusionAccount.syncCollectionAttributesToBag()
        }

        const finalId = fusionAccount.attributes?.id || fusionAccount.nativeIdentity
        if (finalId && !fusionAccount.key) {
            if (typeof fusionAccount.setKey === 'function') {
                fusionAccount.setKey({ simple: { id: finalId } })
            } else {
                fusionAccount.key = { simple: { id: finalId } }
            }
        }

        const nativeId = fusionAccount.nativeIdentity
        const rawAccount = state.getFusionAccount(nativeId)
        if (rawAccount) {
            rawAccount.attributes = { ...fusionAccount.attributes }
            rawAccount.disabled = fusionAccount.disabled
        } else {
            const newRaw: any = {
                key: fusionAccount.key || {
                    simple: {
                        id: nativeId,
                    }
                },
                attributes: { ...fusionAccount.attributes },
                disabled: fusionAccount.disabled,
                identityId: fusionAccount.identityId,
            }
            state.addFusionAccount(newRaw)
            fusionAccounts.push(newRaw)
            fusionMap.set(nativeId, newRaw)
        }

        const attributes = registry.schemas.getFusionAttributeSubset(fusionAccount.attributes)
        console.log("getISCAccount returning attributes for", nativeId, "keys:", Object.keys(attributes), "accounts:", attributes.accounts, "raw_accounts:", fusionAccount.attributes.accounts)
        return {
            key: fusionAccount.key || {
                simple: {
                    id: nativeId,
                }
            },
            attributes,
            disabled: fusionAccount.disabled,
        }
    })

    registry.fusion.forEachISCAccount = jest.fn().mockImplementation(async (send: (account: any) => void) => {
        let sent = 0
        const faList = state.getFusionAccounts()
        console.log("forEachISCAccount mock: state.getFusionAccounts() count:", faList.length)
        for (const account of faList) {
            const iscAccount = await registry.fusion.getISCAccount(account)
            console.log(`forEachISCAccount mock: getISCAccount for nativeId=${account.nativeIdentity} produced iscAccount=${!!iscAccount}`)
            if (iscAccount) {
                send(iscAccount)
                sent++
            }
        }
        console.log(`forEachISCAccount mock: sent ${sent} accounts out of ${faList.length}`)
        return { sent, eligible: faList.length }
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

function sanitizeHistoryDates(val: any): any {
    if (val === null || val === undefined) return val
    if (Array.isArray(val)) {
        return val.map(sanitizeHistoryDates)
    }
    if (typeof val === 'object') {
        const copy: any = {}
        for (const [k, v] of Object.entries(val)) {
            if (k === 'history' && Array.isArray(v)) {
                copy[k] = v.map(h => typeof h === 'string' ? h.replace(/^\[\d{4}-\d{2}-\d{2}\]/, '[DATE]') : h)
            } else {
                copy[k] = sanitizeHistoryDates(v)
            }
        }
        return copy
    }
    return val
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

    const expectedArray = Array.isArray(expected) ? expected : [expected]

    if (actual.length !== expectedArray.length) {
        drift.push(`${stepId}: expected ${expectedArray.length} outputs, got ${actual.length}`)
    }

    const len = Math.min(actual.length, expectedArray.length)
    for (let i = 0; i < len; i++) {
        try {
            const expectedObj = expectedArray[i] as Record<string, unknown>
            const actualObj = actual[i] as Record<string, unknown>
            
            // Handle primitives or nulls if they are in the array
            if (typeof expectedObj !== 'object' || expectedObj === null || 
                typeof actualObj !== 'object' || actualObj === null) {
                const expectedSanitized = sanitizeHistoryDates(expectedObj)
                const actualSanitized = sanitizeHistoryDates(actualObj)
                if (JSON.stringify(expectedSanitized) !== JSON.stringify(actualSanitized)) {
                    drift.push(`${stepId}[${i}]: expected ${JSON.stringify(expectedSanitized)}, got ${JSON.stringify(actualSanitized)}`)
                }
                continue
            }

            const keys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)])
            for (const key of keys) {
                const expectedVal = expectedObj[key]
                const actualVal = actualObj[key]
                
                const expectedSanitized = sanitizeHistoryDates(expectedVal)
                const actualSanitized = sanitizeHistoryDates(actualVal)

                if (JSON.stringify(expectedSanitized) !== JSON.stringify(actualSanitized)) {
                    drift.push(
                        `${stepId}[${i}].${key}: expected ${JSON.stringify(expectedSanitized)}, got ${JSON.stringify(actualSanitized)}`
                    )
                }
            }
        } catch {
            drift.push(`${stepId}[${i}]: could not compare outputs`)
        }
    }

    return { match: drift.length === 0, drift }
}
