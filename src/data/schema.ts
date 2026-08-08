import { SchemaAttribute } from '@sailpoint/connector-sdk'

/**
 * Canonical string identifiers for the connector's default Fusion schema attributes.
 *
 * Every reference to a default attribute name in production code MUST be a member of
 * this enum. The `name` and `id` keys are intentionally excluded — they are SDK
 * structural keys (the schema's `identityAttribute` and `displayAttribute` defaults)
 * as well as schema attribute names, and conflating the two would be misleading.
 *
 * The runtime value of each member is the exact string the SDK has historically used
 * for that attribute, so persisted payloads round-trip unchanged. The contract test
 * in `src/data/__tests__/schema.test.ts` fails if this enum drifts from
 * `fusionAccountSchemaAttributes`.
 */
export enum FusionAttribute {
    History = 'history',
    Statuses = 'statuses',
    Actions = 'actions',
    Accounts = 'accounts',
    MissingAccounts = 'missing-accounts',
    Reviews = 'reviews',
    Sources = 'sources',
    MainAccount = 'mainAccount',
    OriginSource = 'originSource',
    OriginAccount = 'originAccount',
    IdentityId = 'identityId',
}

export const fusionAccountSchemaAttributes: SchemaAttribute[] = [
    {
        name: 'name',
        description: 'Name',
        type: 'string',
        required: true,
    },
    {
        name: 'id',
        description: 'ID',
        type: 'string',
        required: true,
    },
    {
        name: 'history',
        description: 'History',
        type: 'string',
        multi: true,
    },
    {
        name: 'statuses',
        description: 'Statuses',
        type: 'string',
        multi: true,
        entitlement: true,
        managed: false,
        schemaObjectType: 'status',
    },
    {
        name: 'actions',
        description: 'Actions',
        type: 'string',
        multi: true,
        entitlement: true,
        managed: true,
        schemaObjectType: 'action',
    },
    {
        name: 'accounts',
        description: 'Managed account keys (sourceId::nativeIdentity)',
        type: 'string',
        multi: true,
        entitlement: false,
    },
    {
        name: 'missing-accounts',
        description: 'Missing managed account keys (sourceId::nativeIdentity)',
        type: 'string',
        multi: true,
        entitlement: false,
    },
    {
        name: 'reviews',
        description: 'Forms pending review',
        type: 'string',
        multi: true,
        entitlement: false,
    },
    {
        name: 'sources',
        description: 'Managed sources',
        type: 'string',
        multi: false,
        entitlement: false,
    },
    {
        name: 'mainAccount',
        description: 'Managed account ID evaluated first when present',
        type: 'string',
        multi: false,
        entitlement: false,
    },
    {
        name: 'originSource',
        description: 'Origin source name (set on creation, immutable)',
        type: 'string',
        multi: false,
        entitlement: false,
    },
    {
        name: 'originAccount',
        description:
            'Origin identity ID (Identities source) or composite managed account key sourceId::nativeIdentity (managed source); set on creation, immutable',
        type: 'string',
        multi: false,
        entitlement: false,
    },
    {
        name: 'identityId',
        description: 'Correlated ISC identity ID (persisted for round-trip when SDK Account lacks identityId)',
        type: 'string',
        multi: false,
        entitlement: false,
    },
]

