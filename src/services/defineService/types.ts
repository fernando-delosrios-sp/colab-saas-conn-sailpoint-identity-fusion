import { AttributeMergeMode } from '../../model/config'

// ============================================================================
// Type Definitions — Attribute Service
// ============================================================================

/**
 * Resolved configuration for a single attribute mapping, derived from
 * the user-configured {@link AttributeMap} at initialization time.
 */
export type AttributeMappingConfig = {
    /** The target fusion attribute name */
    attributeName: string
    /** Source attribute names to look for in managed accounts */
    sourceAttributes: string[]
    /** Strategy for merging values from multiple sources */
    attributeMerge: AttributeMergeMode
    /** Specific source name (only used with "source" merge strategy) */
    source?: string
}

/**
 * Flags controlling which attribute operations to perform when rebuilding
 * a fusion account (used by single-account operations like read, update, disable).
 */
export type AttributeOperations = {
    /** Whether to re-evaluate attribute mappings from source accounts */
    refreshMapping: boolean
    /** Whether to re-evaluate attribute definitions (Velocity templates) */
    refreshDefinition: boolean
    /** Whether to fully reset generated attributes (re-register unique values) */
    resetDefinition: boolean
}

/** Refresh mappings and definitions without resetting (read, disable). */
export const ATTR_OPS_REFRESH: AttributeOperations = {
    refreshMapping: true,
    refreshDefinition: true,
    resetDefinition: false,
}

/** Full reset: refresh and regenerate unique values (enable). */
export const ATTR_OPS_RESET: AttributeOperations = {
    refreshMapping: true,
    refreshDefinition: true,
    resetDefinition: true,
}

/** No attribute processing (update -- only actions are applied). */
export const ATTR_OPS_NONE: AttributeOperations = {
    refreshMapping: false,
    refreshDefinition: false,
    resetDefinition: false,
}
