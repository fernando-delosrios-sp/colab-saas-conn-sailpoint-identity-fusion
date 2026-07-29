import { buildReportAggregationStats } from '../accountListHelpers'
import { FusionRun } from '../../../model/fusionRun'
import { LogService } from '../../../services/logService'

describe('accountListPhases — buildReportAggregationStats', () => {
    it('maps fetch result and timer into aggregation stats', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const run = new FusionRun()
        run.log = log
        const timer = run.log.timer('test')

        const fetchResult = {
            identitiesFound: 3,
            managedAccountsFound: 10,
            managedAccountsFoundAuthoritative: 6,
            managedAccountsFoundRecord: 2,
            managedAccountsFoundOrphan: 2,
        }

        const identities = { identitiesLoadedCount: 5 } as any
        const stats = buildReportAggregationStats(fetchResult, timer, identities, 7)

        expect(stats.managedAccountsFound).toBe(10)
        expect(stats.managedAccountsFoundAuthoritative).toBe(6)
        expect(stats.managedAccountsFoundRecord).toBe(2)
        expect(stats.managedAccountsFoundOrphan).toBe(2)
        expect(stats.fusionAccountsReturned).toBe(7)
        expect(stats.totalProcessingTime).toBeDefined()
        expect(stats.phaseTiming).toBeDefined()
    })
})

