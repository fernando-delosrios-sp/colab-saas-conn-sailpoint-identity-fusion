import { StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { runAccountListPipeline } from './helpers/accountListPhases'

export { hydrateCorrelatedManagedAccountIdentities } from './helpers/accountListPhases'

/**
 * Account list operation — main entry point for identity fusion processing.
 *
 * Supports an optional dry-run mode via the dryRun input parameter:
 *   { dryRun: { enabled: true, saveFile?: boolean, sendEmail?: string | string[] } }
 *
 * When dry-run mode is active, the operation runs the full account-list pipeline
 * with write inhibition via DryRunApiAdapter, emits optional report artifacts
 * (file and/or email), streams account rows identical to persistent aggregation,
 * and sends a terminal summary object last.
 *
 * The pipeline (phases 1-5) is fallible; the report epilogue always runs so
 * that durable artifacts survive pipeline failures. Pipeline errors are
 * rethrown after the epilogue so failed runs are still marked failed.
 */
export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    await runAccountListPipeline(serviceRegistry, input)
}
