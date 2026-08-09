import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import {
    toSetFromAttribute as attributeToSet,
    getAccountStringAttribute,
    getAccountAttribute,
} from '../utils/attributes'
import { attrSplit } from '../services/mappingService/helpers'
import { FusionAttribute } from '../data/schema'
import { readString, trimStr } from '../utils/safeRead'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionDecision } from './form'
import { FusionAction } from './fusionAction'
import { FusionAccountKind } from './fusionAccountTypes'
import { buildIdentityInfo } from './fusionAccountUtils'
import {
    buildManagedAccountKey,
    getManagedAccountKeyFromAccount,
    normalizeCompositeManagedAccountKey,
} from './managedAccountKey'
import { StatusEntitlement } from './statusEntitlement'
import { FusionAccount, IDENTITIES_SOURCE_NAME } from './fusionAccount'

function applyAttributeCollections(fa: FusionAccount, account: Account): void {
    const statuses = attributeToSet(account.attributes!, FusionAttribute.Statuses)
    const sources = statuses.has(StatusEntitlement.Baseline) ? [IDENTITIES_SOURCE_NAME] : undefined

    fa.applyFactorySeed({
        attributeBagCurrent: { ...account.attributes! },
        attributeBagPrevious: { ...account.attributes! },
    })

    const missingAccountIds: string[] = []
    for (const id of attributeToSet(account.attributes!, FusionAttribute.MissingAccounts)) {
        const normalized = normalizeCompositeManagedAccountKey(id)
        if (normalized) missingAccountIds.push(normalized)
    }

    const prevAccounts = attributeToSet(account.attributes!, FusionAttribute.Accounts)
    const normalizedPrevAccounts = new Set<string>()
    for (const id of prevAccounts) {
        const normalized = normalizeCompositeManagedAccountKey(id)
        if (normalized) normalizedPrevAccounts.add(normalized)
    }

    fa.collections.hydratePersisted({
        sources,
        missingAccountIds,
        reviews: attributeToSet(account.attributes!, FusionAttribute.Reviews),
        statuses: attributeToSet(account.attributes!, FusionAttribute.Statuses),
        actions: attributeToSet(account.attributes!, FusionAttribute.Actions),
        previousAccountIds: normalizedPrevAccounts,
        clearMissingBeforeAdd: true,
        clearReviewsBeforeAdd: true,
    })
}

function applyOriginMetadata(
    fa: FusionAccount,
    account: Account,
    identityInfo: ReturnType<typeof buildIdentityInfo>
): void {
    const originSource = getAccountStringAttribute(account, FusionAttribute.OriginSource)
    if (originSource) fa.layers.originSource = originSource

    const originAccount = getAccountStringAttribute(account, FusionAttribute.OriginAccount)
    if (originAccount) {
        const trimmedOriginAccount = originAccount.trim()
        const fromIdentityOrigin =
            fa.layers.originSource === IDENTITIES_SOURCE_NAME ||
            fa.attributeBag.current?.originSource === IDENTITIES_SOURCE_NAME ||
            fa.attributeBag.current?.sourceOrigin === IDENTITIES_SOURCE_NAME
        if (fromIdentityOrigin) {
            fa.layers.originAccount = trimmedOriginAccount || undefined
        } else {
            fa.layers.originAccount = normalizeCompositeManagedAccountKey(trimmedOriginAccount)
        }
    }

    const fromIdentity =
        fa.layers.originSource === IDENTITIES_SOURCE_NAME ||
        fa.attributeBag.current?.originSource === IDENTITIES_SOURCE_NAME ||
        fa.attributeBag.current?.sourceOrigin === IDENTITIES_SOURCE_NAME
    if (fromIdentity && !fa.collections.statusesSet.has(StatusEntitlement.Baseline)) {
        fa.collections.hydratePersisted({
            statuses: [StatusEntitlement.Baseline],
            sources: [IDENTITIES_SOURCE_NAME],
        })
    }

    if (!identityInfo?.id) {
        const identityId = getAccountStringAttribute(account, FusionAttribute.IdentityId)
        if (identityId && identityId.trim().length > 0) {
            fa.setIdentityIdAttribute(identityId.trim())
        }
    }

    const historyAttr = getAccountAttribute(account, FusionAttribute.History)
    if (Array.isArray(historyAttr) && historyAttr.length > 0) {
        fa.collections.historyOps.importFromArray(historyAttr)
    }
}

export function buildFromFusionAccount(account: Account): FusionAccount {
    const fa = FusionAccount.createForFactory()
    const identityInfo = buildIdentityInfo(account)
    const managedKey = account.nativeIdentity as string

    fa.applyFactorySeed({
        type: FusionAccountKind.Fusion,
        managedKey,
        name: trimStr(account.name),
        sourceName: account.sourceName ?? undefined,
        identityInfo,
        iscAccountId: account.id != null ? account.id : undefined,
        modified: account.modified,
    })
    if (account.disabled !== undefined) fa.layers.disabled = account.disabled
    if (account.uncorrelated !== undefined) {
        fa.layers.uncorrelated = account.uncorrelated
    }

    if (account.attributes) {
        applyAttributeCollections(fa, account)
        applyOriginMetadata(fa, account, identityInfo)
    }

    fa.layers.isIdentity = fa.fromIdentity

    return fa
}

export function buildFromIdentity(identity: IdentityDocument): FusionAccount {
    const fa = FusionAccount.createForFactory()
    const managedKey = `${IDENTITIES_SOURCE_NAME}::${identity.id}`
    const identityInfo = buildIdentityInfo(identity)

    fa.applyFactorySeed({
        type: FusionAccountKind.Identity,
        managedKey,
        name: trimStr(identity.name),
        sourceName: IDENTITIES_SOURCE_NAME,
        identityInfo,
    })
    if (identity.disabled !== undefined) fa.layers.disabled = identity.disabled
    fa.layers.needsRefresh = true
    fa.layers.isIdentity = true

    if (identity.attributes) {
        fa.applyFactorySeed({
            attributeBagCurrent: { ...identity.attributes },
            attributeBagPrevious: { ...identity.attributes },
        })

        fa.collections.hydratePersisted({
            sources: [IDENTITIES_SOURCE_NAME],
            missingAccountIds: attributeToSet(identity.attributes, FusionAttribute.MissingAccounts),
            reviews: attributeToSet(identity.attributes, FusionAttribute.Reviews),
            statuses: attributeToSet(identity.attributes, FusionAttribute.Statuses),
            actions: attributeToSet(identity.attributes, FusionAttribute.Actions),
            clearMissingBeforeAdd: true,
            clearReviewsBeforeAdd: true,
        })
    } else {
        fa.collections.hydratePersisted({
            sources: [IDENTITIES_SOURCE_NAME],
        })
    }

    fa.layers.originSource = IDENTITIES_SOURCE_NAME
    fa.layers.originAccount = identity.id ?? undefined
    fa.collections.hydratePersisted({
        statuses: [StatusEntitlement.Baseline],
    })
    fa.setIdentityIdAttribute(identity.id)
    fa.collections.addHistoryMessage(
        `Set ${trimStr(identity.name) || identity.name || identity.id} [${IDENTITIES_SOURCE_NAME}] as baseline`
    )

    return fa
}

export function buildFromManagedAccount(account: Account): FusionAccount {
    const fa = FusionAccount.createForFactory()

    const sourcesAttr = getAccountAttribute(account, FusionAttribute.Sources)
    const sourceSet = sourcesAttr ? new Set(attrSplit(String(sourcesAttr))) : new Set<string>()

    const managedAccountKey = getManagedAccountKeyFromAccount(account)
    if (!managedAccountKey) {
        throw new ConnectorError(
            'Managed account is missing sourceId and nativeIdentity; cannot build composite account key.',
            ConnectorErrorType.Generic
        )
    }
    const identityInfo = buildIdentityInfo(account)

    fa.applyFactorySeed({
        type: FusionAccountKind.Managed,
        managedKey: managedAccountKey,
        name: trimStr(account.name),
        sourceName: account.sourceName ?? undefined,
        identityInfo,
        iscAccountId: account.id != null ? account.id : undefined,
    })
    if (account.disabled !== undefined) fa.layers.disabled = account.disabled
    fa.layers.needsRefresh = true
    fa.layers.isIdentity = account.uncorrelated === false

    if (account.attributes) {
        fa.applyFactorySeed({
            attributeBagCurrent: { ...account.attributes },
            attributeBagPrevious: { ...account.attributes },
        })

        fa.collections.hydratePersisted({
            sources: sourceSet,
            missingAccountIds: attributeToSet(account.attributes, FusionAttribute.MissingAccounts),
            reviews: attributeToSet(account.attributes, FusionAttribute.Reviews),
            statuses: attributeToSet(account.attributes, FusionAttribute.Statuses),
            actions: attributeToSet(account.attributes, FusionAttribute.Actions),
            clearMissingBeforeAdd: true,
            clearReviewsBeforeAdd: true,
        })
    } else {
        fa.collections.hydratePersisted({
            sources: sourceSet,
        })
    }

    fa.layers.originSource = account.sourceName ?? undefined
    fa.layers.originAccount = managedAccountKey
    fa.collections.hydratePersisted({
        accountIds: [managedAccountKey],
        missingAccountIds: [managedAccountKey],
        statuses: [StatusEntitlement.Uncorrelated],
    })
    fa.layers.uncorrelated = true
    fa.collections.removeActionSilent(FusionAction.Correlated)

    fa.layers._setManagedAccount(account, false, undefined, {
        sources: fa.attributeBag.sources,
    })

    fa.setNeedsReset(true)

    return fa
}

export function buildFromFusionDecision(decision: FusionDecision): FusionAccount {
    const fa = FusionAccount.createForFactory()
    const { account } = decision
    const managedAccountKey = buildManagedAccountKey({
        sourceId: readString(account, 'sourceId'),
        nativeIdentity: readString(account, 'nativeIdentity'),
    })
    if (!managedAccountKey) {
        throw new ConnectorError(
            'Fusion decision account is missing sourceId and nativeIdentity; cannot build composite account key.',
            ConnectorErrorType.Generic
        )
    }

    const identityInfo = decision.identityId ? buildIdentityInfo(decision) : undefined

    fa.applyFactorySeed({
        type: FusionAccountKind.Decision,
        managedKey: managedAccountKey,
        name: trimStr(account.name),
        sourceName: account.sourceName ?? undefined,
        identityInfo,
    })
    fa.layers.needsRefresh = true
    fa.layers.isIdentity = (account as any).uncorrelated === false

    fa.layers.originSource = account.sourceName ?? undefined
    fa.layers.originAccount = managedAccountKey
    fa.collections.hydratePersisted({
        accountIds: [managedAccountKey],
        missingAccountIds: [managedAccountKey],
        statuses: [StatusEntitlement.Uncorrelated],
    })
    fa.layers.uncorrelated = true
    fa.collections.removeActionSilent(FusionAction.Correlated)

    return fa
}
