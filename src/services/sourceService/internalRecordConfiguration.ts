/**
 * Saved packaging decisions for Internal Record sources.
 * The Records Customizer writes this file, then copies it into the package
 * beside the manifest. The connector reads only the packaged copy.
 */

export const INTERNAL_RECORD_CONFIGURATION_FILE = 'internal-record-configuration.json'

/** One saved field on an Internal Record source. */
export interface InternalRecordSchemaField {
    name: string
    multiValued: boolean
}

/** Packaging decisions for one Internal-record dump. */
export interface InternalRecordConfigurationEntry {
    fileName: string
    sourceName: string
    includeRecordAccountsInMatch: boolean
    accountJmespathFilter: string
    accountIdField: string
    accountNameField: string
    schema: InternalRecordSchemaField[]
}

/** Internal Record configuration for every dump in one Records Customizer package. */
export interface InternalRecordConfiguration {
    sources: InternalRecordConfigurationEntry[]
}

/** Answers an interactive pack collects for one dump. */
interface InternalRecordPromptAnswers {
    sourceName: string
    includeRecordAccountsInMatch: boolean
    accountJmespathFilter: string
    accountIdField: string
    accountNameField: string
    schema: InternalRecordSchemaField[]
}

/** What the operator sees while confirming a dump that has no saved entry. */
interface InternalRecordPromptContext {
    fileName: string
    headers: string[]
    schema: InternalRecordSchemaField[]
    /** Re-read the dump after the operator edits the CSV. */
    rescan: () => Promise<{ headers: string[]; schema: InternalRecordSchemaField[] }>
}

/** Collects packaging answers for one unsaved dump. */
export type InternalRecordPrompter = (context: InternalRecordPromptContext) => Promise<InternalRecordPromptAnswers>
