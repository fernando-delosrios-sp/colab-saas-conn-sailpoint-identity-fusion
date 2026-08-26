import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { runReportPipeline } from '../../services/reportPipeline'
import { ActionChange } from './types'

/**
 * Report action handler — generates and sends a Fusion report (Match preview, no persist).
 * Nested `runReportPipeline` activates dry-run, runs setup → fetch → process (no Output stream),
 * then emails the Fusion report to global owners.
 */
export const reportAction = async (
    _fusionAccount: FusionAccount,
    change: ActionChange,
    serviceRegistry: ServiceRegistry
): Promise<void> => {
    if (change.op === AttributeChangeOp.Add) {
        await runReportPipeline(serviceRegistry, false)
    }
}

