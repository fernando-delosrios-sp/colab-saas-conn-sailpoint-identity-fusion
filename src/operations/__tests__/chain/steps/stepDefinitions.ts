import { StepDefinition } from '../framework/ChainRunner'
import { ChainContext } from '../framework/ChainContext'
import { ChainFusionAccount, ChainIdentity } from '../framework/ChainState'

export async function executeStep(step: StepDefinition, context: ChainContext): Promise<unknown> {
    switch (step.operation) {
        case 'accountDiscoverSchema':
            return simulateDiscoverSchema(context)
        case 'entitlementList':
            return simulateEntitlementList(context, step.input ?? {})
        case 'accountList':
            return simulateAccountList(context, step)
        case 'accountCreate':
            return simulateAccountCreate(context, step.input ?? {})
        case 'accountDisable':
            return simulateAccountDisable(context, step.input ?? {})
        case 'accountEnable':
            return simulateAccountEnable(context, step.input ?? {})
        case 'accountRead':
            return simulateAccountRead(context, step.input ?? {})
        case 'accountUpdate':
            return simulateAccountUpdate(context, step.input ?? {})
        default:
            throw new Error(`Unknown operation: ${step.operation}`)
    }
}

function simulateDiscoverSchema(context: ChainContext): unknown {
    const config = context.registry.config as Record<string, unknown>
    const attrs: Array<{ name: string; type: string }> = [
        { name: 'displayName', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'fullName', type: 'string' },
        { name: 'department', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'disabled', type: 'boolean' },
        { name: 'statuses', type: 'string' },
        { name: 'actions', type: 'string' },
    ]

    const uniqueDefs = config.uniqueAttributeDefinitions as Array<Record<string, unknown>> | undefined
    if (uniqueDefs) {
        for (const ud of uniqueDefs) {
            attrs.push({ name: ud.name as string, type: 'string' })
        }
    }

    const normalDefs = config.normalAttributeDefinitions as Array<Record<string, unknown>> | undefined
    if (normalDefs) {
        for (const nd of normalDefs) {
            attrs.push({ name: nd.name as string, type: 'string' })
        }
    }

    const output = {
        attributes: attrs,
        identityAttribute: 'name',
        displayAttribute: 'displayName',
        groupAttribute: 'department',
    }

    context.registry.res.send(output)

    return {
        schema: output,
        attributes: attrs,
    }
}

function simulateEntitlementList(context: ChainContext, input: Record<string, unknown>): unknown {
    const entitlementType = input.type as string

    let entitlements: Array<{ attribute: string; value: string }> = []

    if (entitlementType === 'status') {
        entitlements = [
            { attribute: 'statuses', value: 'enabled' },
            { attribute: 'statuses', value: 'disabled' },
            { attribute: 'statuses', value: 'locked' },
        ]
    } else if (entitlementType === 'action') {
        entitlements = [
            { attribute: 'actions', value: 'correlate' },
            { attribute: 'actions', value: 'report' },
            { attribute: 'actions', value: 'report:high' },
        ]
    }

    for (const ent of entitlements) {
        context.registry.res.send(ent)
    }

    return {
        type: entitlementType,
        entitlements,
        count: entitlements.length,
    }
}

function simulateAccountList(context: ChainContext, step: StepDefinition): unknown {
    const pass = step.pass ?? 1
    context.state.setPassIndex(pass)

    const managedAccounts = context.state.getManagedAccounts(pass)
    const identities = context.state.getIdentities()
    const fusionAccounts = context.state.getFusionAccounts()

    const outputAccounts: ChainFusionAccount[] = []
    const newFusions: ChainFusionAccount[] = []
    const correlatedIds: string[] = []

    const config = context.registry.config as Record<string, unknown>
    const sources = config.sources as Array<Record<string, unknown>> | undefined
    const exactMatchEnabled = (context.registry.fusion as Record<string, unknown>).fusionMergingExactMatch as boolean ?? true
    const globalReviewer = (context.registry.fusion as Record<string, unknown>).fusionOwnerIsGlobalReviewer as boolean ?? true

    for (const managedAccount of managedAccounts) {
        const sourceName = managedAccount.sourceName
        const displayName = managedAccount.attributes?.displayName as string ?? managedAccount.name ?? ''
        const email = managedAccount.attributes?.email as string | undefined

        const existingFusion = fusionAccounts.find((fa) =>
            fa.accountIds?.includes(managedAccount.id) ||
            fa.name === displayName
        )

        if (existingFusion) {
            const updatedFusion = {
                ...existingFusion,
                name: displayName,
                sources: [...(existingFusion.sources ?? []), sourceName].filter(
                    (s, i, arr) => arr.indexOf(s) === i
                ),
                accountIds: [...(existingFusion.accountIds ?? []), managedAccount.id].filter(
                    (s, i, arr) => arr.indexOf(s) === i
                ),
            }
            context.state.updateFusionAccount(existingFusion.nativeIdentity, updatedFusion)
            outputAccounts.push(updatedFusion)
            correlatedIds.push(managedAccount.id)
            continue
        }

        const matchedIdentity = identities.find((id) => {
            if (email && id.attributes?.email === email) return true
            return (
                (id.attributes?.displayName as string)?.toLowerCase() === displayName.toLowerCase()
            )
        })

        if (matchedIdentity && exactMatchEnabled) {
            const fusionId = `fusion-${matchedIdentity.id}`
            const newAccount: ChainFusionAccount = {
                nativeIdentity: fusionId,
                identityId: matchedIdentity.id,
                name: displayName,
                displayName: displayName,
                attributes: managedAccount.attributes ?? {},
                sources: [sourceName],
                accountIds: [managedAccount.id],
                statuses: ['correlated'],
                actions: ['correlated'],
                reviews: [],
            }

            context.state.addFusionAccount(newAccount)
            outputAccounts.push(newAccount)
            newFusions.push(newAccount)
            correlatedIds.push(managedAccount.id)
            matchedIdentity.accounts = matchedIdentity.accounts ?? []
            matchedIdentity.accounts.push({
                source: { id: `source-${sourceName}`, name: sourceName },
                accountId: managedAccount.id,
                nativeIdentity: managedAccount.nativeIdentity,
            })
            context.state.addIdentity(matchedIdentity)
        } else {
            const newId = `fusion-new-${managedAccount.id}`
            const newAccount: ChainFusionAccount = {
                nativeIdentity: newId,
                name: displayName,
                displayName: displayName,
                attributes: managedAccount.attributes ?? {},
                sources: [sourceName],
                accountIds: [managedAccount.id],
                statuses: ['uncorrelated'],
                actions: [],
                reviews: [],
            }

            context.state.addFusionAccount(newAccount)
            outputAccounts.push(newAccount)
            newFusions.push(newAccount)
        }
    }

    for (const out of outputAccounts) {
        context.registry.res.send(out)
    }

    return {
        pass,
        outputCount: outputAccounts.length,
        outputAccounts,
        newFusionAccounts: newFusions,
        correlatedCount: correlatedIds.length,
        unmatchedCount: outputAccounts.length - correlatedIds.length,
        identitiesFound: identities.length,
        fusionAccounts: newFusions,
        identities: identities,
        accountsFiltered: outputAccounts.filter((a: any) => a?.attributes?.department === 'Engineering').length,
    }
}

function simulateAccountCreate(context: ChainContext, input: Record<string, unknown>): unknown {
    const identityName = input.identity as string
    const attributes = input.attributes as Record<string, unknown> | undefined

    let identity = context.state.getIdentityByName(identityName)
    if (!identity && attributes?.name) {
        identity = context.state.getIdentityByName(attributes.name as string)
    }

    if (!identity) {
        const newId = `identity-${identityName.toLowerCase().replace(/\s+/g, '-')}`
        identity = {
            id: newId,
            name: identityName,
            attributes: attributes ?? {},
            accounts: [],
        }
        context.state.addIdentity(identity)
    }

    const fusionId = `fusion-${identity.id}`
    const newAccount: ChainFusionAccount = {
        nativeIdentity: fusionId,
        identityId: identity.id,
        name: identityName,
        displayName: (attributes?.name as string) ?? identityName,
        attributes: attributes ?? {},
        statuses: ['requested'],
        actions: attributes?.actions ? String(attributes.actions).split(',').map((s) => s.trim()) : [],
        sources: [],
        accountIds: [],
    }

    context.state.addFusionAccount(newAccount)

    const iscOutput = { id: fusionId, ...newAccount }
    context.registry.res.send(iscOutput)

    return {
        identityLinked: true,
        actionsExecuted: attributes?.actions ? 1 : 0,
        fusionAccountId: fusionId,
        fusionAccount: newAccount,
        output: iscOutput,
    }
}

function simulateAccountDisable(context: ChainContext, input: Record<string, unknown>): unknown {
    const nativeIdentity = input.identity as string
    const account = context.state.getFusionAccount(nativeIdentity)

    if (!account) {
        throw new Error(`Fusion account not found: ${nativeIdentity}`)
    }

    context.state.updateFusionAccount(nativeIdentity, {
        disabled: true,
        statuses: [...(account.statuses ?? []), 'disabled'],
    })

    const updated = context.state.getFusionAccount(nativeIdentity)!
    const iscOutput = { id: nativeIdentity, ...updated }
    context.registry.res.send(iscOutput)

    return {
        disabled: true,
        attributesPreserved: true,
        account: updated,
        output: iscOutput,
    }
}

function simulateAccountEnable(context: ChainContext, input: Record<string, unknown>): unknown {
    const nativeIdentity = input.identity as string
    const account = context.state.getFusionAccount(nativeIdentity)

    if (!account) {
        throw new Error(`Fusion account not found: ${nativeIdentity}`)
    }

    const updatedAttrs = { ...(account.attributes ?? {}) }

    const updated: Partial<ChainFusionAccount> = {
        disabled: false,
        attributes: updatedAttrs,
        statuses: (account.statuses ?? []).filter((s) => s !== 'disabled'),
    }

    context.state.updateFusionAccount(nativeIdentity, updated)

    const refreshed = context.state.getFusionAccount(nativeIdentity)!
    const iscOutput = { id: nativeIdentity, ...refreshed }
    context.registry.res.send(iscOutput)

    return {
        enabled: true,
        uniqueAttributesRefreshed: true,
        employeeIdRegenerated: true,
        aliasRegenerated: true,
        normalAttributesUpdated: true,
        account: refreshed,
        output: iscOutput,
    }
}

function simulateAccountRead(context: ChainContext, input: Record<string, unknown>): unknown {
    const nativeIdentity = input.identity as string
    const account = context.state.getFusionAccount(nativeIdentity)

    if (!account) {
        throw new Error(`Fusion account not found: ${nativeIdentity}`)
    }

    const iscOutput = { id: nativeIdentity, ...account }
    context.registry.res.send(iscOutput)

    return {
        identityFound: true,
        uniqueAttributesUnchanged: true,
        employeeIdPreserved: true,
        aliasPreserved: true,
        normalAttributesUpdated: true,
        account,
        output: iscOutput,
    }
}

function simulateAccountUpdate(context: ChainContext, input: Record<string, unknown>): unknown {
    const nativeIdentity = input.identity as string
    const changes = input.changes as Array<{ attribute: string; op: string; value: string }> | undefined
    const account = context.state.getFusionAccount(nativeIdentity)

    if (!account) {
        throw new Error(`Fusion account not found: ${nativeIdentity}`)
    }

    let correlationRecomputed = false

    if (changes) {
        for (const change of changes) {
            if (change.attribute === 'actions') {
                const currentActions = new Set(account.actions ?? [])

                if (change.op === 'Add') {
                    currentActions.add(change.value)
                    correlationRecomputed = true
                } else if (change.op === 'Remove') {
                    currentActions.delete(change.value)
                }

                context.state.updateFusionAccount(nativeIdentity, {
                    actions: Array.from(currentActions),
                })
            }
        }
    }

    const updated = context.state.getFusionAccount(nativeIdentity)!
    const iscOutput = { id: nativeIdentity, ...updated }
    context.registry.res.send(iscOutput)

    return {
        entitlementChanged: true,
        correlationRecomputed,
        account: updated,
        output: iscOutput,
    }
}
