import Bottleneck from 'bottleneck'
import { shouldRetry, calculateRetryDelay } from '../clientService/helpers'
import { internalConfig } from '../../data/config'

export { Priority } from './types'

export type LimiterStats = {
    api: Bottleneck.Counts
    objects: Bottleneck.Counts
}

export class LimiterService {
    readonly api: Bottleneck
    readonly objects: Bottleneck
    private totalRetries = 0
    private readonly maxRetries: number
    private disposed = false

    constructor(private readonly config: { apiMaxConcurrent: number; objectMaxConcurrent: number }) {
        const safeApiMaxConcurrent = Math.max(1, config.apiMaxConcurrent || 0)
        const safeObjectMaxConcurrent = Math.max(1, config.objectMaxConcurrent || 0)
        const ics = internalConfig.clientService
        const reservoirAmount = Math.max(1, ics.reservoirAmount || 0)
        const reservoirWindowMs = Math.max(250, ics.reservoirWindowMs || 0)
        this.maxRetries = ics.maxLimiterRetries

        const apiOpts: Bottleneck.ConstructorOptions = {
            minTime: 0,
            maxConcurrent: safeApiMaxConcurrent,
            reservoir: reservoirAmount,
            reservoirRefreshAmount: reservoirAmount,
            reservoirRefreshInterval: reservoirWindowMs,
            trackDoneStatus: true,
        }
        const objectOpts: Bottleneck.ConstructorOptions = {
            minTime: 0,
            maxConcurrent: safeObjectMaxConcurrent,
            trackDoneStatus: true,
        }

        this.api = new Bottleneck(apiOpts)
        this.objects = new Bottleneck(objectOpts)

        this.api.on('failed', async (error, info) => {
            if (this.disposed) return
            if (!shouldRetry(error) || info.retryCount >= this.maxRetries) {
                return
            }
            this.totalRetries++
            return calculateRetryDelay(info.retryCount + 1, error)
        })
    }

    stats(): LimiterStats {
        return {
            api: this.api.counts(),
            objects: this.objects.counts(),
        }
    }

    getTotalRetries(): number {
        return this.totalRetries
    }

    /**
     * Schedule work on the objects limiter for each item; preserves order of results.
     */
    async runAll<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, scheduleOpts?: { priority?: number }): Promise<R[]> {
        const p = scheduleOpts?.priority
        return Promise.all(
            items.map((item, index) =>
                p !== undefined
                    ? this.objects.schedule({ priority: p }, () => fn(item, index))
                    : this.objects.schedule({}, () => fn(item, index))
            )
        )
    }

    dispose(): void {
        this.disposed = true
        this.api.removeAllListeners()
        this.objects.removeAllListeners()
        void this.api.stop({ dropWaitingJobs: true })
        void this.objects.stop({ dropWaitingJobs: true })
        void this.api.disconnect()
        void this.objects.disconnect()
    }
}
