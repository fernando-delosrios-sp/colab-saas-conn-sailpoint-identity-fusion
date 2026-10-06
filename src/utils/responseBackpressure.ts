import type { Readable, Writable } from 'node:stream'
import type { Response } from '@sailpoint/connector-sdk'

/**
 * Pause once the host stream's readable side is holding more than this many
 * bytes and the writable side has not already asked us to wait.
 * Object-mode queues are bounded by writableNeedDrain (highWaterMark in objects).
 */
const READABLE_BACKLOG_BYTES = 1024 * 1024

type OutputStream = Writable & Partial<Pick<Readable, 'readableLength'>>

/**
 * SDK `Response.send` calls `writable.write()` and drops the boolean, so a slow
 * platform client queues every account in the connector process. Account list
 * then dies with "JavaScript heap out of memory" while most of the output is
 * still sitting in that queue. Wait until the stream drains before continuing.
 */
export async function sendWithBackpressure<T>(res: Response<T>, output: T): Promise<void> {
    res.send(output)
    const stream = unwrapOutputStream(res)
    if (!stream || stream.destroyed || stream.writableEnded) return
    await waitUntilStreamAcceptsMore(stream)
}

function unwrapOutputStream(res: Response<unknown>): OutputStream | undefined {
    let current: unknown = res
    const seen = new Set<unknown>()
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current)
        const node = current as { _writable?: OutputStream; _inner?: unknown }
        if (node._writable && typeof node._writable.write === 'function') {
            return node._writable
        }
        current = node._inner
    }
    return undefined
}

function pipedDestinations(stream: OutputStream): Writable[] {
    const pipes = (stream as { _readableState?: { pipes?: Writable | Writable[] | null } })._readableState?.pipes
    if (!pipes) return []
    return (Array.isArray(pipes) ? pipes : [pipes]).filter((dest) => !dest.destroyed && !dest.writableEnded)
}

function needsPause(stream: OutputStream): boolean {
    if (stream.destroyed || stream.writableEnded) return false
    if (stream.writableNeedDrain) return true
    return (stream.readableLength ?? 0) > READABLE_BACKLOG_BYTES
}

async function waitUntilStreamAcceptsMore(stream: OutputStream): Promise<void> {
    let idleSpins = 0
    while (needsPause(stream)) {
        if (stream.writableNeedDrain) {
            await onceDrainOrClose(stream)
            idleSpins = 0
            continue
        }

        const destination = pipedDestinations(stream).find((dest) => dest.writableNeedDrain)
        const readableBefore = stream.readableLength ?? 0
        if (destination) {
            await onceDrainOrClose(destination)
        } else {
            await new Promise((resolve) => setImmediate(resolve))
        }

        const readableAfter = stream.readableLength ?? 0
        if (readableAfter >= readableBefore) {
            idleSpins += 1
            if (idleSpins > 5) return
        } else {
            idleSpins = 0
        }
    }
}

function onceDrainOrClose(stream: Writable): Promise<void> {
    if (!stream.writableNeedDrain || stream.destroyed || stream.writableEnded) {
        return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            stream.removeListener('drain', onDrain)
            stream.removeListener('error', onError)
            stream.removeListener('close', onClose)
        }
        const onDrain = () => {
            cleanup()
            resolve()
        }
        const onClose = () => {
            cleanup()
            resolve()
        }
        const onError = (error: Error) => {
            cleanup()
            reject(error)
        }

        if (!stream.writableNeedDrain || stream.destroyed || stream.writableEnded) {
            resolve()
            return
        }

        stream.on('drain', onDrain)
        stream.on('error', onError)
        stream.on('close', onClose)
    })
}
