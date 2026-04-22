import Bottleneck from 'bottleneck'
import { shouldRetry, calculateRetryDelay } from '../clientService/helpers'
import { internalConfig } from '../../data/config'
import { Priority } from './types'

export { Priority } from './types'

export type LimiterStats = {
    api: Bottleneck.Counts
    objects: Bottleneck.Counts
}

export class LimiterService {
    private readonly group: Bottleneck.Group
    readonly api: Bottleneck
    readonly objects: Bottleneck
    private totalRetries = 0
    private readonly maxRetries: number
    private readonly objectMaxConcurrent: number
    private disposed = false

    constructor(private readonly config: { apiMaxConcurrent: number; objectMaxConcurrent: number }) {
        this.objectMaxConcurrent = config.objectMaxConcurrent
        const ics = internalConfig.clientService
        this.maxRetries = ics.maxLimiterRetries

        const baseOpts: Bottleneck.ConstructorOptions = {
            minTime: 0,
            highWater: null,
            strategy: Bottleneck.strategy.LEAK,
            maxConcurrent: config.apiMaxConcurrent,
            reservoir: ics.reservoirAmount,
            reservoirRefreshAmount: ics.reservoirAmount,
            reservoirRefreshInterval: ics.reservoirWindowMs,
            trackDoneStatus: true,
        }

        this.group = new Bottleneck.Group(baseOpts)
        this.api = this.group.key('api')
        this.objects = this.group.key('objects')

        this.api.updateSettings({
            ...baseOpts,
            id: 'api',
            maxConcurrent: config.apiMaxConcurrent,
        })
        this.objects.updateSettings({
            minTime: 0,
            highWater: null,
            strategy: Bottleneck.strategy.LEAK,
            maxConcurrent: config.objectMaxConcurrent,
            trackDoneStatus: true,
            id: 'objects',
        })

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
        const out: R[] = new Array(items.length)
        for (let s = 0; s < items.length; s += this.objectMaxConcurrent) {
            const end = Math.min(s + this.objectMaxConcurrent, items.length)
            const batch = await Promise.all(
                items.slice(s, end).map((item, j) => {
                    const index = s + j
                    return p !== undefined
                        ? this.objects.schedule({ priority: p }, () => fn(item, index))
                        : this.objects.schedule({}, () => fn(item, index))
                })
            )
            for (let k = 0; k < batch.length; k++) out[s + k] = batch[k]
        }
        return out
    }

    dispose(): void {
        this.disposed = true
        this.group.removeAllListeners()
        void this.api.stop({ dropWaitingJobs: true })
        void this.objects.stop({ dropWaitingJobs: true })
        void this.group.disconnect()
    }
}
