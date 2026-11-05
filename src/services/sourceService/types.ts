import { OwnerDto } from 'sailpoint-api-client'
import { SourceConfig, SourceType } from '../../model/config'
import type { InternalRecordConfigurationEntry } from './internalRecordConfiguration'

// ============================================================================
// Type Definitions — Source Service
// ============================================================================

/**
 * Lightweight representation of an ISC source relevant to fusion processing.
 * Combines API-fetched data with local configuration.
 */
export type SourceInfo = {
    /** ISC source ID */
    id: string
    /** Human-readable source name */
    name: string
    /** Whether this source is configured as a managed (input) source for fusion */
    isManaged: boolean
    /** Processing type for managed sources */
    sourceType: SourceType
    /** User-provided source configuration (only present for managed sources) */
    config?: SourceConfig
    /** Source owner identity (only present for the fusion source itself) */
    owner?: OwnerDto
    /** True when accounts come from a packaged Internal-record dump. */
    internalProvenance?: boolean
    /** Saved packaging decisions when this source comes from the Internal Record configuration. */
    internalRecord?: InternalRecordConfigurationEntry
}
