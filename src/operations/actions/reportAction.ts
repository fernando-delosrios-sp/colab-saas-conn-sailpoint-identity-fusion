import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { buildReportContext, fetchResultToAggregationStats } from '../helpers/accountListPhases'
import { generateReport } from '../helpers/generateReport'
import { ActionChange } from './types'

/**
 * Report action handler - generates and sends a fusion report.
 * Runs the full dry-run pipeline (setup → fetch → process) to collect data,
 * then renders and sends the email report.
 * @param serviceRegistry - Request-scoped registry (required for concurrent updates to avoid global state)
 */
export const reportAction = async (
    _fusionAccount: FusionAccount,
    change: ActionChange,
    serviceRegistry: ServiceRegistry
): Promise<void> => {
    if (change.op === AttributeChangeOp.Add) {
        const { fetchResult, timer } = await buildReportContext(serviceRegistry)
        await generateReport(false, serviceRegistry, fetchResultToAggregationStats(fetchResult, timer))
    }
}
