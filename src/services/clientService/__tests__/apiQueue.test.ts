import { ApiQueue } from '../queue'
import { QueuePriority, QueueConfig } from '../types'
import { shouldRetry, calculateRetryDelay, invokeAbortable } from '../helpers'
import type { Mock } from 'vitest'

vi.mock('@sailpoint/connector-sdk', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}))

vi.mock('../../../data/config', () => ({
    internalConfig: {
        clientService: {
            maxStatsSamples: 100,
            queueProcessingIntervalMs: 10,
            rateLimitWindowMs: 10_000,
            rateLimitMaxRequestsDefault: 80,
            rateLimitMaxRequestsCap: 100,
        }
    }
}))

// Mock retry helpers only; keep abort/signal helpers real for in-flight abort tests
vi.mock('../helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../helpers')>()
    return {
        ...actual,
        shouldRetry: vi.fn(),
        calculateRetryDelay: vi.fn(),
    }
})

describe('ApiQueue', () => {
    let queue: ApiQueue;
    const tracked: Promise<unknown>[] = [];

    const track = <T>(promise: Promise<T>): Promise<T> => {
        tracked.push(promise)
        return promise
    }

    const trackEnqueue = <T>(
        execute: () => Promise<T>,
        options?: Parameters<ApiQueue['enqueue']>[1]
    ) => track(queue.enqueue(execute, options))

    afterEach(async () => {
        if (queue) {
            queue.stop();
            queue.clear();
            await new Promise((resolve) => setTimeout(resolve, 50));
            await Promise.allSettled(tracked);
            tracked.length = 0;
        }
        vi.clearAllMocks();
    });

    const createConfig = (overrides?: Partial<QueueConfig>): QueueConfig => ({
        requestsPerSecond: 10,
        maxConcurrentRequests: 10,
        maxRetries: 3,
        enablePriority: true,
        ...overrides
    });

    it('1. Priority ordering — Enqueue items at LOW, MEDIUM, HIGH. Verify HIGH executes first, then MEDIUM, then LOW.', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 1 }));

        let blockerResolve: () => void;
        const blocker = new Promise<void>(resolve => { blockerResolve = resolve });
        
        // Take up the only concurrency slot so others queue up
        trackEnqueue(() => blocker, { priority: QueuePriority.HIGH });

        const executedOrder: string[] = [];
        const createTask = (id: string) => async () => {
            executedOrder.push(id);
            return id;
        };

        const p1 = trackEnqueue(createTask('low'), { priority: QueuePriority.LOW });
        const p2 = trackEnqueue(createTask('medium'), { priority: QueuePriority.MEDIUM });
        const p3 = trackEnqueue(createTask('high'), { priority: QueuePriority.HIGH });

        // Wait a tick to ensure all are enqueued and waiting in their sub-queues
        await new Promise(resolve => setTimeout(resolve, 10));

        // Unblock the queue
        blockerResolve!();
        await Promise.all([p1, p2, p3]);

        expect(executedOrder).toEqual(['high', 'medium', 'low']);
    });

    it('2. FIFO within priority — Multiple items at same priority execute in insertion order.', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 1 }));

        let blockerResolve: () => void;
        const blocker = new Promise<void>(resolve => { blockerResolve = resolve });
        trackEnqueue(() => blocker, { priority: QueuePriority.MEDIUM });

        const executedOrder: string[] = [];
        const createTask = (id: string) => async () => {
            executedOrder.push(id);
            return id;
        };

        const p1 = trackEnqueue(createTask('first'), { priority: QueuePriority.MEDIUM });
        const p2 = trackEnqueue(createTask('second'), { priority: QueuePriority.MEDIUM });
        const p3 = trackEnqueue(createTask('third'), { priority: QueuePriority.MEDIUM });

        await new Promise(resolve => setTimeout(resolve, 10));

        blockerResolve!();
        await Promise.all([p1, p2, p3]);

        expect(executedOrder).toEqual(['first', 'second', 'third']);
    });

    it('3. Priority disabled — When enablePriority: false, all items go to MEDIUM (pure FIFO).', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 1, enablePriority: false }));

        let blockerResolve: () => void;
        const blocker = new Promise<void>(resolve => { blockerResolve = resolve });
        trackEnqueue(() => blocker, { priority: QueuePriority.HIGH });

        const executedOrder: string[] = [];
        const createTask = (id: string) => async () => {
            executedOrder.push(id);
            return id;
        };

        // Even though we specify priorities, they should execute in insertion order because priority is disabled
        const p1 = trackEnqueue(createTask('first-low'), { priority: QueuePriority.LOW });
        const p2 = trackEnqueue(createTask('second-high'), { priority: QueuePriority.HIGH });
        const p3 = trackEnqueue(createTask('third-medium'), { priority: QueuePriority.MEDIUM });

        await new Promise(resolve => setTimeout(resolve, 10));

        blockerResolve!();
        await Promise.all([p1, p2, p3]);

        expect(executedOrder).toEqual(['first-low', 'second-high', 'third-medium']);
    });

    it('4. Concurrency limits — Set maxConcurrentRequests: 2, enqueue 5 items, verify at most 2 execute concurrently.', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 2 }));
        
        let active = 0;
        let maxActive = 0;
        const resolves: Array<() => void> = [];
        
        const createTask = () => async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>(resolve => resolves.push(resolve));
            active--;
        };
        
        const promises = Array(5).fill(0).map(() => trackEnqueue(createTask()));
        
        // Wait for event loop to let tasks start
        await new Promise(resolve => setTimeout(resolve, 20));
        
        // Only 2 should be active initially
        expect(active).toBe(2);
        expect(maxActive).toBe(2);
        
        // Resolve first task
        resolves[0]();
        await new Promise(resolve => setTimeout(resolve, 20));
        
        // Now one more should have started
        expect(active).toBe(2);
        expect(maxActive).toBe(2);
        
        // Resolve the rest
        const interval = setInterval(() => {
            while (resolves.length > 0) resolves.shift()!()
        }, 10)
        await Promise.all(promises);
        clearInterval(interval);
        
        expect(maxActive).toBe(2); // Never exceeded 2
    });

    it('5. Sliding window rate limiting — burst within window allowed up to cap.', async () => {
        queue = new ApiQueue(createConfig({
            rateLimitMaxRequests: 3,
            rateLimitWindowMs: 10_000,
            maxConcurrentRequests: 10,
        }))

        const executionTimes: number[] = []
        const createTask = () => async () => {
            executionTimes.push(Date.now())
        }

        await Promise.all([
            trackEnqueue(createTask()),
            trackEnqueue(createTask()),
            trackEnqueue(createTask()),
        ])

        expect(executionTimes.length).toBe(3)
        const span = executionTimes[2] - executionTimes[0]
        expect(span).toBeLessThan(200)
    })

    it('5b. Rate-limit wait does not consume concurrency slots.', async () => {
        queue = new ApiQueue(createConfig({
            maxConcurrentRequests: 5,
            rateLimitMaxRequests: 2,
            rateLimitWindowMs: 10_000,
        }))

        const resolves: Array<() => void> = []
        const slowTask = () => new Promise<void>((resolve) => resolves.push(resolve))

        const p1 = trackEnqueue(slowTask)
        const p2 = trackEnqueue(slowTask)
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(queue.getStats().activeRequests).toBe(2)

        const waiting = [
            trackEnqueue(slowTask),
            trackEnqueue(slowTask),
            trackEnqueue(slowTask),
        ]
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(queue.getStats().activeRequests).toBe(2)

        for (const resolve of resolves) resolve()
        await Promise.allSettled([p1, p2])
        queue.stop()
        await Promise.allSettled(waiting)
    })

    it('5c. Fifteen in-flight with headroom — rate waiters do not block new HTTP starts', async () => {
        queue = new ApiQueue(createConfig({
            maxConcurrentRequests: 20,
            rateLimitMaxRequests: 100,
            rateLimitWindowMs: 10_000,
        }))

        const resolves: Array<() => void> = []
        const slowTask = () => new Promise<void>((resolve) => resolves.push(resolve))
        const started: string[] = []
        const idTask = (id: string) => async () => {
            started.push(id)
            await slowTask()
        }

        const first15 = Array.from({ length: 15 }, (_, i) => trackEnqueue(idTask(`slow-${i}`)))
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(queue.getStats().activeRequests).toBe(15)

        const next5 = Array.from({ length: 5 }, (_, i) => trackEnqueue(idTask(`fast-${i}`)))
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(queue.getStats().activeRequests).toBe(20)
        expect(started.filter((id) => id.startsWith('fast-'))).toHaveLength(5)

        for (const resolve of resolves) resolve()
        await Promise.allSettled([...first15, ...next5])
    })

    it('6. Retry on failure — Enqueue a function that fails with 429 on first call, succeeds on second.', async () => {
        queue = new ApiQueue(createConfig());
        
        let calls = 0;
        const error = new Error('429 Too Many Requests');
        
        (shouldRetry as Mock).mockImplementation((err) => err.message === '429 Too Many Requests');
        (calculateRetryDelay as Mock).mockReturnValue(10);
        
        const task = async () => {
            calls++;
            if (calls === 1) throw error;
            return 'success';
        };
        
        const result = await trackEnqueue(task, { maxRetries: 3 });
        
        expect(calls).toBe(2);
        expect(result).toBe('success');
        
        const stats = queue.getStats();
        expect(stats.totalRetries).toBe(1);
    });

    it('7. Max retries exhausted — Function always fails with 500, maxRetries: 2.', async () => {
        queue = new ApiQueue(createConfig());
        
        let calls = 0;
        const error = new Error('500 Internal Server Error');
        
        (shouldRetry as Mock).mockImplementation(() => true);
        (calculateRetryDelay as Mock).mockReturnValue(5);
        
        const task = async () => {
            calls++;
            throw error;
        };
        
        await expect(trackEnqueue(task, { maxRetries: 2 })).rejects.toThrow('500 Internal Server Error');
        
        // 1 initial call + 2 retries = 3 total attempts
        expect(calls).toBe(3);
        
        const stats = queue.getStats();
        expect(stats.totalRetries).toBe(2);
        expect(stats.totalFailed).toBe(1);
    });

    it('8. noRetry flag — Function fails with 500, noRetry: true. Verify immediate rejection.', async () => {
        queue = new ApiQueue(createConfig());
        
        let calls = 0;
        const error = new Error('500 Internal Server Error');
        
        (shouldRetry as Mock).mockImplementation(() => true);
        
        const task = async () => {
            calls++;
            throw error;
        };
        
        await expect(trackEnqueue(task, { maxRetries: 3, noRetry: true })).rejects.toThrow('500 Internal Server Error');
        
        expect(calls).toBe(1);
        
        const stats = queue.getStats();
        expect(stats.totalRetries).toBe(0);
        expect(stats.totalFailed).toBe(1);
    });

    it('9. Abort signal — Enqueue with AbortSignal, abort before execution.', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 1 }));
        
        const abortController = new AbortController();
        
        let blockerResolve: () => void;
        const blocker = new Promise<void>(resolve => { blockerResolve = resolve });
        const p1 = trackEnqueue(() => blocker); // Block the queue
        
        const task = async () => 'should not execute';
        const promise = trackEnqueue(task, { abortSignal: abortController.signal });
        
        abortController.abort();
        
        await expect(promise).rejects.toThrow('Aborted');
        
        blockerResolve!();
        await p1;
    });

    it('9b. Abort signal — abort during in-flight execution', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 5 }))

        const abortController = new AbortController()
        let startedResolve: () => void
        const started = new Promise<void>((resolve) => {
            startedResolve = resolve
        })

        const task = async () => {
            startedResolve!()
            return invokeAbortable(
                () => new Promise<string>((resolve) => setTimeout(() => resolve('done'), 5000)),
                abortController.signal
            )
        }

        const promise = trackEnqueue(task, { abortSignal: abortController.signal })
        await started
        abortController.abort()
        await expect(promise).rejects.toThrow(/aborted/i)
    })

    it('10. clear() — Enqueue items, call clear(), verify all pending items reject.', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 1 }));
        
        let _blockerResolve: () => void;
        const blocker = new Promise<void>(resolve => { _blockerResolve = resolve });
        const p1 = trackEnqueue(() => blocker); // Block the queue (active item)
        
        const p2 = trackEnqueue(async () => 'queued'); // Pending item
        const p3 = trackEnqueue(async () => 'queued'); // Pending item
        
        await new Promise(resolve => setTimeout(resolve, 10)); // Ensure enqueued
        
        queue.clear();
        
        await expect(p1).rejects.toThrow('Queue cleared');
        await expect(p2).rejects.toThrow('Queue cleared');
        await expect(p3).rejects.toThrow('Queue cleared');
        
        expect(queue.getStats().queueLength).toBe(0);
        expect(queue.getStats().activeRequests).toBe(0);
    });

    it('11. stop() — Call stop(), verify processing halts.', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 1 }));
        
        queue.stop();
        
        let executed = false;
        const p = trackEnqueue(async () => { executed = true; });
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        expect(executed).toBe(false);
        queue.clear();
        await expect(p).rejects.toThrow('Queue cleared');
    });

    it('12. getStats() — Verify stats update after processing.', async () => {
        queue = new ApiQueue(createConfig());
        
        const task = async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            return 'done';
        };
        
        await trackEnqueue(task);
        await trackEnqueue(task);
        
        // Wait for stats to flush from finally blocks
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const stats = queue.getStats();
        expect(stats.totalProcessed).toBe(2);
        expect(stats.totalFailed).toBe(0);
        expect(stats.averageProcessingTime).toBeGreaterThanOrEqual(15);
        expect(stats.queueLength).toBe(0);
        expect(stats.activeRequests).toBe(0);
    });

    it('13. getPendingItems() / getActiveItems() — Verify serializable item info returned.', async () => {
        queue = new ApiQueue(createConfig({ maxConcurrentRequests: 1 }));
        
        let blockerResolve: () => void;
        const blocker = new Promise<void>(resolve => { blockerResolve = resolve });
        
        const p1 = trackEnqueue(() => blocker, { id: 'active-item', priority: QueuePriority.HIGH, label: 'Active' });
        const p2 = trackEnqueue(async () => 'done', { id: 'pending-item', priority: QueuePriority.LOW, label: 'Pending' });
        
        await new Promise(resolve => setTimeout(resolve, 10)); // Ensure queued
        
        const activeItems = queue.getActiveItems();
        expect(activeItems).toHaveLength(1);
        expect(activeItems[0]).toMatchObject({
            id: 'active-item',
            priority: QueuePriority.HIGH,
            label: 'Active',
            retryCount: 0
        });
        
        const pendingItems = queue.getPendingItems();
        expect(pendingItems).toHaveLength(1);
        expect(pendingItems[0]).toMatchObject({
            id: 'pending-item',
            priority: QueuePriority.LOW,
            label: 'Pending',
            retryCount: 0
        });
        
        blockerResolve!();
        await p1;
        await p2;
    });
});

