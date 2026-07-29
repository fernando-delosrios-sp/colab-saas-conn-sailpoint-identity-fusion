import {
    AttributeChangeOp,
    StdAccountUpdateInput,
} from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { rebuildFusionAccount } from './rebuildFusionAccount'
import { FusionAttribute } from '../../data/schema'
import { FusionAction } from '../../model/fusionAction'
import { assert } from '../../utils/assert'
import { trimStr } from '../../utils/safeRead'
import { executeActions } from '../actions'
import { ATTR_OPS_NONE } from '../../services/definitionService/types'

type ReverseCorrelationSnapshot = Map<string, { exists: boolean; value: unknown }>

function getReverseCorrelationAttributes(serviceRegistry: ServiceRegistry): string[] {
    return serviceRegistry.config.sources
        .filter((sourceConfig) => sourceConfig.correlationMode === 'reverse' && sourceConfig.correlationAttribute)
        .map((sourceConfig) => sourceConfig.correlationAttribute as string)
}

async function captureReverseCorrelationSnapshot(
    serviceRegistry: ServiceRegistry,
    identity: string,
    attributeNames: string[]
): Promise<ReverseCorrelationSnapshot> {
    const snapshot: ReverseCorrelationSnapshot = new Map()
    if (attributeNames.length === 0) {
        return snapshot
    }

    const { sources } = serviceRegistry
    await sources.fetchFusionAccount(identity)
    const fusionSourceAccount = sources.fusionAccountsByNativeIdentity?.get(identity)
    const fusionSourceAttributes = (fusionSourceAccount?.attributes ?? {}) as Record<string, unknown>
    for (const attributeName of attributeNames) {
        snapshot.set(attributeName, {
            exists: Object.prototype.hasOwnProperty.call(fusionSourceAttributes, attributeName),
            value: fusionSourceAttributes[attributeName],
        })
    }
    return snapshot
}

function restoreReverseCorrelationSnapshot(
    fusionAccount: {
        setReverseCorrelationAttribute(attributeName: string, value: string): void
        clearReverseCorrelationAttribute(attributeName: string): void
    },
    snapshot: ReverseCorrelationSnapshot
): void {
    if (snapshot.size === 0) {
        return
    }
    for (const [attributeName, entry] of snapshot.entries()) {
        if (entry.exists) {
            fusionAccount.setReverseCorrelationAttribute(attributeName, entry.value as string)
        } else {
            fusionAccount.clearReverseCorrelationAttribute(attributeName)
        }
    }
}

function resolveAccountUpdateLabel(
    fusionAccount: { name?: string; attributes?: Record<string, unknown> },
    fusionDisplayAttribute: string | undefined,
    identity: string
): string {
    return (
        trimStr(fusionAccount.name) ??
        trimStr(
            fusionDisplayAttribute
                ? (fusionAccount.attributes?.[fusionDisplayAttribute] as string | undefined)
                : undefined
        ) ??
        identity
    )
}

function shouldSkipCorrelationStatusRecompute(change: {
    op?: AttributeChangeOp
    value?: unknown
}): boolean {
    if (change.op !== AttributeChangeOp.Remove) {
        return false
    }
    const actionValues = [change.value].flat().map((value) => String(value).split(':')[0])
    return actionValues.some((value) => value === 'correlate' || value === FusionAction.Correlated)
}

/**
 * Runs the account-update pipeline: setup, rebuild, action processing, and output.
 */
export async function runAccountUpdatePipeline(
    serviceRegistry: ServiceRegistry,
    input: StdAccountUpdateInput
): Promise<string> {
    const { log, sources, schemas, fusion, res, identities } = serviceRegistry

    assert(input.identity, 'Account identity is required')
    assert(input.changes, 'Account changes are required')
    assert(input.changes.length > 0, 'At least one change is required')

    const reverseCorrelationAttributes = getReverseCorrelationAttributes(serviceRegistry)
    const timer = log.timer()

    log.stepStart('load-sources-schema')
    await sources.fetchAllSources()
    const reverseCorrelationSnapshot = await captureReverseCorrelationSnapshot(
        serviceRegistry,
        input.identity,
        reverseCorrelationAttributes
    )
    await schemas.setFusionAccountSchema(input.schema)
    log.stepEnd('load-sources-schema')

    log.stepStart('rebuild-fusion-account')
    const fusionAccount = await rebuildFusionAccount(input.identity, ATTR_OPS_NONE, {
        fusion,
        identities,
        sources,
        log,
    })
    assert(fusionAccount, `Fusion account not found for identity: ${input.identity}`)
    const accountLabel = resolveAccountUpdateLabel(fusionAccount, schemas.fusionDisplayAttribute, input.identity)
    log.detail({ account: accountLabel, action: 'updating account' })
    log.debug(`Found fusion account: ${accountLabel || fusionAccount.managedKey}`)
    log.stepEnd('rebuild-fusion-account')

    log.stepStart('process-changes', { count: input.changes.length })
    let shouldRecomputeCorrelationStatus = true
    for (const change of input.changes) {
        assert(change.attribute, 'Change attribute is required')

        if (change.attribute === FusionAttribute.Actions) {
            if (shouldSkipCorrelationStatusRecompute(change)) {
                shouldRecomputeCorrelationStatus = false
            }
            await executeActions(fusionAccount, change, serviceRegistry)
        } else {
            log.crash(`Unsupported entitlement change: ${change.attribute}`)
        }
    }
    log.stepEnd('process-changes', { count: input.changes.length })

    restoreReverseCorrelationSnapshot(fusionAccount, reverseCorrelationSnapshot)

    log.stepStart('generate-account')
    const iscAccount = await fusion.getISCAccount(fusionAccount, true, shouldRecomputeCorrelationStatus)
    assert(iscAccount, 'Failed to generate ISC account from fusion account')
    log.stepEnd('generate-account')

    res.send(iscAccount)
    timer.end(`✓ Account update completed for ${accountLabel}`)
    return accountLabel
}
