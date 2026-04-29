import { AttributeDefinitionV2025, SchemaV2025 } from 'sailpoint-api-client'
import { AccountSchema, SchemaAttribute } from '@sailpoint/connector-sdk'

// ============================================================================
// Helper Functions
// ============================================================================

export const isAccountSchema = (schema: SchemaV2025): boolean => {
    return schema.nativeObjectType === 'User' || schema.nativeObjectType === 'account' || schema.name === 'account'
}

const normalizeAttributeType = (type: unknown): string => {
    return typeof type === 'string' && type.trim().length > 0 ? type.toLowerCase() : 'string'
}

export const attributeDefinitionToSchemaAttribute = (
    attributeDefinition?: AttributeDefinitionV2025 | null
): SchemaAttribute => {
    const safeDefinition = attributeDefinition ?? {}
    return {
        name: safeDefinition.name ?? '',
        description: safeDefinition.description ?? '',
        type: normalizeAttributeType(safeDefinition.type),
        multi: safeDefinition.isMulti ?? false,
        entitlement: safeDefinition.isEntitlement ?? false,
    }
}

export const apiSchemaToAccountSchema = (apiSchema: SchemaV2025): AccountSchema => {
    const attributes = (apiSchema.attributes ?? [])
        .map((x) => attributeDefinitionToSchemaAttribute(x))
        .filter((x) => x.name.trim().length > 0)
    const accountSchema: AccountSchema = {
        displayAttribute: apiSchema.displayAttribute!,
        identityAttribute: apiSchema.identityAttribute!,
        attributes,
        groupAttribute: '',
    }

    return accountSchema
}
