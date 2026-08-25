/**
 * Wall-clock duration in milliseconds using `performance.now()`.
 */

export async function measureMs(fn: () => void | Promise<void>): Promise<number> {
    const start = performance.now()
    await fn()
    return performance.now() - start
}

export function measureMsSync(fn: () => void): number {
    const start = performance.now()
    fn()
    return performance.now() - start
}
