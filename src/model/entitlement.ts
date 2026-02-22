import { Attributes } from '@sailpoint/connector-sdk'

/** Raw data for constructing any entitlement (status or action). */
export type EntitlementSource = {
    id: string
    name: string
    description: string
}

/**
 * Base class for entitlement objects (status and action).
 * Provides a common structure with identity, uuid, type, and attributes.
 */
export class Entitlement {
    identity: string
    uuid: string
    type: string
    attributes: Attributes

    constructor(type: string, object: EntitlementSource) {
        this.type = type
        this.attributes = { ...object }
        this.identity = this.attributes.id as string
        this.uuid = this.attributes.name as string
    }
}
