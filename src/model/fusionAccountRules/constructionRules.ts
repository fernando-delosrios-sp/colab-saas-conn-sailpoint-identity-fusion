import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { Attributes, ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import {
    toSetFromAttribute as attributeToSet,
    getAccountStringAttribute,
    getAccountAttribute,
} from '../../utils/attributes'
import { attrSplit } from '../../services/mappingService/helpers'
import { FusionAttribute } from '../../data/schema'
import { readString, trimStr } from '../../utils/safeRead'
import { StatusEntitlement } from '../statusEntitlement'
import { FusionAction } from '../fusionAction'
import { FusionDecision } from '../form'
import { FusionAccountState } from '../fusionAccountState'
import { FusionAccountKind } from '../fusionAccountTypes'
import type { IdentityInfo } from '../fusionAccountTypes'
import {
    buildManagedAccountKey,
    getManagedAccountKeyFromAccount,
    normalizeCompositeManagedAccountKey,
} from '../managedAccountKey'
import { buildIdentityInfo } from '../fusionAccountUtils'
import { addHistory, formatHistoryAccountInfo } from './historyRules'

export const IDENTITIES_SOURCE_NAME = 'Identities'

function initializeCoreState(
    state: FusionAccountState,
    config: {
        type: FusionAccountKind
        managedKey: string
        name: string | null | undefined
        sourceName: string | null | undefined
        disabled?: boolean
        needsRefresh?: boolean
        identityInfo?: IdentityInfo
        iscAccountId?: string | null
        modified?: string
        isIdentity?: boolean
    }
): void {
    state.type = config.type
    state.managedKey = config.managedKey
    const trimmedName = trimStr(config.name)
    if (trimmedName) state.name = trimmedName
    if (config.sourceName) state.sourceName = config.sourceName
    if (config.disabled !== undefined) state.disabled = config.disabled
    if (config.needsRefresh !== undefined) state.needsRefresh = config.needsRefresh
    if (config.identityInfo) {
        state.identityInfo = config.identityInfo
    }
    if (config.iscAccountId != null) state.iscAccountId = config.iscAccountId
    if (config.modified !== undefined) state.modified = config.modified
    if (config.isIdentity !== undefined) state.isIdentity = config.isIdentity
}

function initializeSources(state: FusionAccountState, sources: string[] | Set<string> | undefined): void {
    if (!sources) return
    state.sources = Array.isArray(sources) ? new Set(sources) : sources
}

function initializeAttributeState(
    state: FusionAccountState,
    attributes: Attributes | null | undefined,
    kind: FusionAccountKind,
    managedKey?: string
): void {
    if (!attributes) return
    state.attributeBag.current = { ...attributes }
    if (kind === FusionAccountKind.Fusion && managedKey) {
        state.attributeBag.previous = { ...attributes }
    }
    initializeMissingAccountIds(state, attributes)
    initializeReviews(state, attributes)
    initializeStatuses(state, attributes)
    initializeActions(state, attributes)
}

function initializeMissingAccountIds(state: FusionAccountState, attributes: Attributes | null | undefined): void {
    state.missingAccountIds = attributeToSet(attributes, FusionAttribute.MissingAccounts)
}

function initializeReviews(state: FusionAccountState, attributes: Attributes | null | undefined): void {
    state.reviews = attributeToSet(attributes, FusionAttribute.Reviews)
}

function initializeStatuses(state: FusionAccountState, attributes: Attributes | null | undefined): void {
    state.statuses = attributeToSet(attributes, FusionAttribute.Statuses)
}

function initializeActions(state: FusionAccountState, attributes: Attributes | null | undefined): void {
    state.actions = attributeToSet(attributes, FusionAttribute.Actions)
}

function initializePreviousAccountIds(state: FusionAccountState, attributes: Attributes | null | undefined): void {
    state.previousAccountIds = attributeToSet(attributes, FusionAttribute.Accounts)
}

function deriveBaselineSourceSet(attributes: Attributes | null | undefined): Set<string> {
    const sourceSet = new Set<string>()
    const statuses = attributeToSet(attributes, FusionAttribute.Statuses)
    if (statuses.has(StatusEntitlement.Baseline)) {
        sourceSet.add(IDENTITIES_SOURCE_NAME)
    }
    return sourceSet
}

function setOrigin(
    state: FusionAccountState,
    sourceName: string | null | undefined,
    accountId: string | null | undefined
): void {
    state.originSource = sourceName ?? undefined
    state.originAccount = accountId ?? undefined
}

function markIdentityOrigin(state: FusionAccountState, accountId: string | null | undefined): void {
    state.originSource = IDENTITIES_SOURCE_NAME
    state.originAccount = accountId ?? undefined
    state.statuses.add(StatusEntitlement.Baseline)
}

function restoreOriginMetadata(state: FusionAccountState, account: Account): void {
    const originSource = getAccountStringAttribute(account, FusionAttribute.OriginSource)
    if (originSource) {
        state.originSource = originSource
    }

    const originAccount = getAccountStringAttribute(account, FusionAttribute.OriginAccount)
    if (originAccount) {
        const normalizedOriginAccount = normalizeCompositeManagedAccountKey(originAccount)
        const trimmedOriginAccount = originAccount.trim()
        state.originAccount = normalizedOriginAccount ?? (trimmedOriginAccount || undefined)
    }

    ensureBaselineForIdentityOrigin(state)
}

function restoreIdentityLinkage(state: FusionAccountState, account: Account): void {
    if (state.identityInfo?.id) return
    const identityId = getAccountStringAttribute(account, FusionAttribute.IdentityId)
    if (identityId && identityId.trim().length > 0) {
        setIdentityIdAttribute(state, identityId.trim())
    }
}

export function setIdentityIdAttribute(state: FusionAccountState, value: string | undefined): void {
    const trimmed = trimStr(value) ?? ''
    if (!state.identityInfo) {
        state.identityInfo = { id: trimmed, name: '', displayName: '' }
        return
    }
    state.identityInfo.id = trimmed
}

function ensureBaselineForIdentityOrigin(state: FusionAccountState): void {
    if (isFromIdentity(state) && !state.statuses.has(StatusEntitlement.Baseline)) {
        state.statuses.add(StatusEntitlement.Baseline)
        state.sources.add(IDENTITIES_SOURCE_NAME)
    }
}

function importHistoryIntoState(state: FusionAccountState, history: unknown[]): void {
    const normalizedHistory = history
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)

    const dedupedHistory: string[] = []
    for (const entry of normalizedHistory) {
        if (dedupedHistory[dedupedHistory.length - 1] !== entry) {
            dedupedHistory.push(entry)
        }
    }

    state.history = dedupedHistory.slice(-state.maxHistoryMessages)
}

function restorePersistedCollections(state: FusionAccountState, account: Account): void {
    initializePreviousAccountIds(state, account.attributes)
    const historyAttr = getAccountAttribute(account, FusionAttribute.History)
    if (Array.isArray(historyAttr) && historyAttr.length > 0) {
        importHistoryIntoState(state, historyAttr)
    }
}

function isFromIdentity(state: FusionAccountState): boolean {
    const originFromAttributes = state.attributeBag.current?.originSource
    const legacyOriginFromAttributes = state.attributeBag.current?.sourceOrigin
    return (
        state.originSource === IDENTITIES_SOURCE_NAME ||
        originFromAttributes === IDENTITIES_SOURCE_NAME ||
        legacyOriginFromAttributes === IDENTITIES_SOURCE_NAME
    )
}

/**
 * Builds a FusionAccountState from an existing fusion source account (ISC Account object).
 * Used during aggregation to reconstruct fusion accounts from the previous run.
 * Restores all persisted state including attributes, collections, origin source, and identity linkage.
 *
 * Construction sequence:
 * 1. `initializeCoreState` — scalar fields (type, managedKey, name, sourceName, disabled, identityInfo, modified, iscAccountId).
 * 2. `initializeSources` — virtual IDENTITIES_SOURCE_NAME source if persisted statuses include baseline.
 * 3. `initializeAttributeState` — current/previous attribute bags and collection sets (missing-accounts, reviews, statuses, actions).
 * 4. `restoreOriginMetadata` — persisted originSource/originAccount; re-asserts baseline for identity-origin records.
 * 5. `restoreIdentityLinkage` — identityId fallback from persisted attributes when the SDK Account does not expose it.
 * 6. `restorePersistedCollections` — previous account IDs and history import.
 *
 * @param account - The ISC Account object from the fusion source
 * @param state - The state container to populate
 */
export function buildFromFusionAccount(account: Account, state: FusionAccountState): void {
    const identityInfo = buildIdentityInfo(account)
    const managedKey = account.nativeIdentity as string

    initializeCoreState(state, {
        type: FusionAccountKind.Fusion,
        managedKey,
        name: account.name,
        sourceName: account.sourceName,
        disabled: account.disabled,
        identityInfo,
        modified: account.modified,
        iscAccountId: account.id,
        isIdentity: account.uncorrelated === false,
    })
    initializeSources(state, deriveBaselineSourceSet(account.attributes))
    initializeAttributeState(state, account.attributes, FusionAccountKind.Fusion, managedKey)
    restoreOriginMetadata(state, account)
    restoreIdentityLinkage(state, account)
    restorePersistedCollections(state, account)
}

/**
 * Builds a FusionAccountState from an ISC identity (authoritative mode).
 * The identity becomes the baseline for the fusion account, with its
 * attributes forming the initial state.
 *
 * @param identity - The ISC identity document
 * @param state - The state container to populate
 */
export function buildFromIdentity(identity: IdentityDocument, state: FusionAccountState): void {
    const managedKey = `${IDENTITIES_SOURCE_NAME}::${identity.id}`
    initializeCoreState(state, {
        type: FusionAccountKind.Identity,
        managedKey,
        name: identity.name,
        sourceName: IDENTITIES_SOURCE_NAME,
        disabled: identity.disabled,
        needsRefresh: true,
        identityInfo: buildIdentityInfo(identity),
        isIdentity: true,
    })
    initializeSources(state, [IDENTITIES_SOURCE_NAME])
    initializeAttributeState(state, identity.attributes, FusionAccountKind.Identity, managedKey)
    markIdentityOrigin(state, identity.id)
    setIdentityIdAttribute(state, identity.id)
    state.statuses.add(StatusEntitlement.Baseline)
    addHistory(state, `Set ${formatHistoryAccountInfo(state.name, state.sourceName)} as baseline`)
}

/**
 * Builds a FusionAccountState from an uncorrelated managed source account.
 * Used when a source account doesn't match any existing fusion identity
 * and needs to enter the Match workflow.
 *
 * @param account - The uncorrelated ISC Account from a managed source
 * @param state - The state container to populate
 */
export function buildFromManagedAccount(account: Account, state: FusionAccountState): void {
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

    initializeCoreState(state, {
        type: FusionAccountKind.Managed,
        managedKey: managedAccountKey,
        name: account.name,
        sourceName: account.sourceName,
        disabled: account.disabled,
        needsRefresh: true,
        identityInfo,
        iscAccountId: account.id,
        isIdentity: account.uncorrelated === false,
    })
    initializeSources(state, sourceSet)
    initializeAttributeState(state, account.attributes, FusionAccountKind.Managed, managedAccountKey)
    setOrigin(state, account.sourceName, managedAccountKey)
    state.accountIds.add(managedAccountKey)
    state.missingAccountIds.add(managedAccountKey)
    state.uncorrelated = true
    state.statuses.add(StatusEntitlement.Uncorrelated)
    state.actions.delete(FusionAction.Correlated)
}

/**
 * Builds a FusionAccountState from a reviewer's fusion decision.
 * Used when processing form responses where a reviewer has decided
 * whether an account should create a new identity or merge with an existing one.
 *
 * @param decision - The fusion decision from the review form
 * @param state - The state container to populate
 */
export function buildFromFusionDecision(decision: FusionDecision, state: FusionAccountState): void {
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
    initializeCoreState(state, {
        type: FusionAccountKind.Decision,
        managedKey: managedAccountKey,
        name: account.name,
        sourceName: account.sourceName,
        needsRefresh: true,
        identityInfo: decision.identityId ? buildIdentityInfo(decision) : undefined,
        isIdentity: (account as any).uncorrelated === false,
    })
    setOrigin(state, account.sourceName, managedAccountKey)
    state.accountIds.add(managedAccountKey)
    state.missingAccountIds.add(managedAccountKey)
    state.uncorrelated = true
    state.statuses.add(StatusEntitlement.Uncorrelated)
    state.actions.delete(FusionAction.Correlated)
}
